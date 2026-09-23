<?php

declare(strict_types=1);

namespace Status\Probe;

use DateTimeImmutable;
use Status\Model\BuildProgress;
use Status\Model\GitStatus;
use Status\Model\ProjectStatus;
use Status\Model\State;
use Status\Targets\ProjectTarget;
use Status\Time;

/**
 * Read-only repository evidence. The collector never fetches, cleans, resets,
 * stashes, or pulls: a dirty checkout is a finding, not something to fix.
 */
final class GitProbe
{
    public const VERSION = 'git-project-v1';
    public const GIT = '/usr/bin/git';
    public const STALE_COMMIT_DAYS = 30;

    public function __construct(private readonly CommandRunner $runner)
    {
    }

    public function probe(ProjectTarget $target): ProjectStatus
    {
        $checkedAt = Time::now();
        if (!is_dir($target->repoPath . '/.git')) {
            return $this->result($target, $checkedAt, State::Unknown, 'repository checkout was not found', new GitStatus(), null);
        }

        $branch = $this->git($target, ['rev-parse', '--abbrev-ref', 'HEAD']);
        $upstream = $this->git($target, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
        $counts = $upstream === null ? null : self::parseAheadBehind((string) $this->git($target, ['rev-list', '--left-right', '--count', '@{u}...HEAD']));
        $porcelain = $this->git($target, ['status', '--porcelain=v1']);
        $committed = $this->git($target, ['log', '-1', '--format=%cI']);
        $contents = @file_get_contents($target->repoPath . '/BUILD.md');

        $git = new GitStatus(
            branch: $branch,
            upstream: $upstream,
            ahead: $counts[0] ?? null,
            behind: $counts[1] ?? null,
            dirty: $porcelain === null ? null : trim($porcelain) !== '',
            latestCommitAgeDays: $committed === null ? null : self::commitAgeDays($committed, $checkedAt),
        );
        $build = $contents === false ? null : BuildProgress::parse($contents);
        [$state, $reason] = self::evaluate($git, $build);

        return $this->result($target, $checkedAt, $state, $reason, $git, $build);
    }

    /** `rev-list --left-right --count @{u}...HEAD` prints "<behind>\t<ahead>". @return array{0: int, 1: int}|null ahead, behind */
    public static function parseAheadBehind(string $output): ?array
    {
        return preg_match('/^\s*(\d+)\s+(\d+)\s*$/', $output, $matches) ? [(int) $matches[2], (int) $matches[1]] : null;
    }

    public static function commitAgeDays(string $output, DateTimeImmutable $checkedAt): ?int
    {
        try {
            $committed = Time::parse($output);
        } catch (\RuntimeException) {
            return null;
        }
        return intdiv(max(0, $checkedAt->getTimestamp() - $committed->getTimestamp()), 86400);
    }

    /** @return array{0: State, 1: string} */
    public static function evaluate(GitStatus $git, ?BuildProgress $build): array
    {
        if ($git->branch === null) {
            return [State::Unknown, 'git branch could not be read'];
        }

        $reasons = [];
        if ($git->dirty === true) {
            $reasons[] = 'working tree has uncommitted changes';
        }
        $ahead = $git->ahead ?? 0;
        $behind = $git->behind ?? 0;
        if ($ahead > 0 && $behind > 0) {
            $reasons[] = "branch is {$ahead} ahead and {$behind} behind upstream";
        } elseif ($ahead > 0) {
            $reasons[] = "branch is {$ahead} ahead of upstream";
        } elseif ($behind > 0) {
            $reasons[] = "branch is {$behind} behind upstream";
        }
        if ($git->upstream === null) {
            $reasons[] = 'upstream branch is not configured';
        }
        if ($git->latestCommitAgeDays !== null && $git->latestCommitAgeDays > self::STALE_COMMIT_DAYS) {
            $reasons[] = "latest commit is {$git->latestCommitAgeDays} days old";
        }

        if ($reasons === []) {
            $progress = $build === null ? 'BUILD progress unavailable' : "BUILD progress {$build->checked}/{$build->total}";
            return [State::Operational, "repository is current; {$progress}"];
        }
        return [State::Degraded, implode('; ', $reasons)];
    }

    /** @param list<string> $arguments */
    private function git(ProjectTarget $target, array $arguments): ?string
    {
        $result = $this->runner->run([self::GIT, '-c', 'safe.directory=*', '-C', $target->repoPath, ...$arguments]);
        return $result->succeeded() ? trim($result->stdout) : null;
    }

    private function result(ProjectTarget $target, DateTimeImmutable $checkedAt, State $state, string $reason,
        GitStatus $git, ?BuildProgress $build): ProjectStatus
    {
        return new ProjectStatus($target->id, $target->name, $target->repoName, $target->publicUrl,
            $state, $checkedAt, $reason, $git, $build, self::VERSION);
    }
}
