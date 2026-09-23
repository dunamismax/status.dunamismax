<?php

declare(strict_types=1);

namespace Status\Model;

/** Checkbox progress from a repository's BUILD.md. */
final readonly class BuildProgress
{
    public function __construct(public int $checked, public int $total, public ?string $nextPhase)
    {
    }

    /** Counts `- [x]` and `- [ ]` items; the next phase is the first `###` section with an open item. */
    public static function parse(string $contents): ?self
    {
        $checked = 0;
        $total = 0;
        $activePhase = null;
        $sectionHasUnchecked = false;
        $nextPhase = null;

        foreach (preg_split('/\R/', $contents) ?: [] as $line) {
            $trimmed = trim($line);
            if (str_starts_with($trimmed, '### ')) {
                if ($sectionHasUnchecked && $nextPhase === null) {
                    $nextPhase = $activePhase;
                }
                $activePhase = substr($trimmed, 4);
                $sectionHasUnchecked = false;
                continue;
            }
            if (str_starts_with($trimmed, '- [x]') || str_starts_with($trimmed, '- [X]')) {
                $checked++;
                $total++;
            } elseif (str_starts_with($trimmed, '- [ ]')) {
                $total++;
                $sectionHasUnchecked = true;
            }
        }
        if ($sectionHasUnchecked && $nextPhase === null) {
            $nextPhase = $activePhase;
        }

        return $total > 0 ? new self($checked, $total, $nextPhase) : null;
    }

    public function toArray(): array
    {
        return ['checked' => $this->checked, 'total' => $this->total, 'next_phase' => $this->nextPhase];
    }

    public static function fromArray(array $data): self
    {
        return new self((int) ($data['checked'] ?? 0), (int) ($data['total'] ?? 0),
            isset($data['next_phase']) ? (string) $data['next_phase'] : null);
    }
}
