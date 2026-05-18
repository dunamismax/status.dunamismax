use status_web::{
    alert::{AlertConfig, WebhookNotifier, evaluate_alerts},
    config::Config,
    model::{DeploymentEvent, StatusSnapshot},
    probes::ProbeRunner,
    project,
    router::{AppState, router_with_state},
    store::StatusStore,
};
use tokio::net::TcpListener;
use tracing::info;
use tracing_subscriber::{EnvFilter, fmt, layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let config = Config::from_env()?;
    init_tracing(&config.log_filter)?;
    let store = connect_store(config.database_url.as_deref()).await?;

    if let Some(deployment_event) = &config.deployment_event {
        record_deployment(store.as_ref(), deployment_event).await?;
        return Ok(());
    }

    if config.collect_once {
        collect_once(store.as_ref(), config.retention_days, &config.alert).await?;
        return Ok(());
    }

    let listener = TcpListener::bind(config.bind_addr).await?;
    info!(addr = %config.bind_addr, "starting status-web");

    axum::serve(
        listener,
        router_with_state(AppState::live_with_store(
            store,
            config.operator_token.clone(),
        ))
        .into_make_service(),
    )
    .with_graceful_shutdown(shutdown_signal())
    .await?;

    Ok(())
}

async fn connect_store(
    database_url: Option<&str>,
) -> Result<Option<StatusStore>, Box<dyn std::error::Error>> {
    let Some(database_url) = database_url else {
        return Ok(None);
    };

    let store = StatusStore::connect(database_url).await?;
    store.migrate().await?;
    info!("postgresql status history is configured");
    Ok(Some(store))
}

async fn record_deployment(
    store: Option<&StatusStore>,
    deployment: &DeploymentEvent,
) -> Result<(), Box<dyn std::error::Error>> {
    let Some(store) = store else {
        return Err("STATUS_DATABASE_URL is required when STATUS_RECORD_DEPLOYMENT is true".into());
    };

    store.record_deployment(deployment).await?;
    info!(
        service_id = deployment.service_id.as_deref().unwrap_or("unknown"),
        repo_name = deployment.repo_name.as_deref().unwrap_or("unknown"),
        environment = %deployment.environment,
        deployed_at = %deployment.deployed_at,
        "recorded deployment event"
    );
    Ok(())
}

async fn collect_once(
    store: Option<&StatusStore>,
    retention_days: u32,
    alert_config: &AlertConfig,
) -> Result<(), Box<dyn std::error::Error>> {
    let runner = ProbeRunner::new();
    let services = runner.collect_monitored_services().await;
    let projects = project::collect_project_status().await;
    let snapshot = StatusSnapshot::from_services_and_projects(services, projects);

    if let Some(store) = store {
        store.record_snapshot(&snapshot).await?;
        send_alert_notifications(store, alert_config, &snapshot).await?;
        let pruned = store.prune_check_runs(retention_days).await?;
        info!(
            pruned_check_runs = pruned,
            retention_days, "stored one status snapshot"
        );
    } else if alert_config.notifications_enabled() {
        return Err(
            "STATUS_DATABASE_URL is required for alert notifications and duplicate suppression"
                .into(),
        );
    } else {
        println!("{}", serde_json::to_string(&snapshot)?);
    }

    Ok(())
}

async fn send_alert_notifications(
    store: &StatusStore,
    alert_config: &AlertConfig,
    snapshot: &StatusSnapshot,
) -> Result<(), Box<dyn std::error::Error>> {
    let Some(webhook_url) = alert_config.webhook_url.as_deref() else {
        return Ok(());
    };

    let alerts = evaluate_alerts(snapshot);
    let unsuppressed = store
        .unsuppressed_alerts(
            &alerts,
            alert_config.repeat_after_minutes,
            alert_config.max_notifications_per_run,
        )
        .await?;
    let notifier = WebhookNotifier::new(webhook_url)?;

    for alert in unsuppressed {
        notifier.send(&alert).await?;
        store.record_alert_notification(&alert, "webhook").await?;
        info!(
            target_id = %alert.target_id,
            severity = alert.severity.as_str(),
            state = alert.state.as_str(),
            "sent alert notification"
        );
    }

    Ok(())
}

fn init_tracing(filter: &str) -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::registry()
        .with(EnvFilter::try_new(filter)?)
        .with(fmt::layer())
        .try_init()?;

    Ok(())
}

async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("failed to install Ctrl-C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("failed to install signal handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        () = ctrl_c => {}
        () = terminate => {}
    }
}
