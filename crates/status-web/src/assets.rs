use axum::{
    http::header,
    response::{IntoResponse, Response},
};

pub const STYLE_CSS: &str = include_str!("../assets/style.css");
pub const ICON_SVG: &str = include_str!("../assets/icon.svg");
pub const ROBOTS_TXT: &str = include_str!("../assets/robots.txt");

const SHORT_CACHE: &str = "public, max-age=300, must-revalidate";
const ICON_CACHE: &str = "public, max-age=86400";

pub async fn style_css() -> Response {
    (
        [
            (header::CONTENT_TYPE, "text/css; charset=utf-8"),
            (header::CACHE_CONTROL, SHORT_CACHE),
        ],
        STYLE_CSS,
    )
        .into_response()
}

pub async fn icon_svg() -> Response {
    (
        [
            (header::CONTENT_TYPE, "image/svg+xml; charset=utf-8"),
            (header::CACHE_CONTROL, ICON_CACHE),
        ],
        ICON_SVG,
    )
        .into_response()
}

pub async fn robots_txt() -> Response {
    (
        [
            (header::CONTENT_TYPE, "text/plain; charset=utf-8"),
            (header::CACHE_CONTROL, SHORT_CACHE),
        ],
        ROBOTS_TXT,
    )
        .into_response()
}
