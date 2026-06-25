//! Web access for the Keeper: search (DuckDuckGo HTML scrape, no key) and
//! fetch (GET a URL → readable text). Both touch the network, so the agent
//! loop runs them async and gates them ask-first — they send queries / page
//! content to external servers. No HTML-parser dependency: the markup is
//! stripped by hand, which is fragile by design (DDG can change its markup).

use std::time::Duration;

/// Cap on the text handed back to the model from one fetch/search.
const WEB_RESULT_CAP: usize = 12 * 1024;
const REQUEST_TIMEOUT: Duration = Duration::from_secs(20);
/// A browser-ish UA — DDG's HTML endpoint rejects obvious bots.
const USER_AGENT: &str =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:120.0) Gecko/20100101 Firefox/120.0";

fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(REQUEST_TIMEOUT)
        .user_agent(USER_AGENT)
        .build()
        .map_err(|e| format!("http client error: {e}"))
}

fn cap(mut s: String) -> String {
    if s.len() > WEB_RESULT_CAP {
        let mut end = WEB_RESULT_CAP;
        while !s.is_char_boundary(end) {
            end -= 1;
        }
        s.truncate(end);
        s.push_str("\n…[truncated]");
    }
    s
}

/// DuckDuckGo HTML search → a numbered list of title / url / snippet.
pub async fn web_search(query: &str, limit: usize) -> Result<String, String> {
    let query = query.trim();
    if query.is_empty() {
        return Err("query is empty".into());
    }
    let limit = limit.clamp(1, 10);
    let resp = http_client()?
        .get("https://html.duckduckgo.com/html/")
        .query(&[("q", query)])
        .send()
        .await
        .map_err(|e| format!("search request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("search failed: HTTP {}", resp.status()));
    }
    let body = resp
        .text()
        .await
        .map_err(|e| format!("reading search response failed: {e}"))?;
    let results = parse_ddg(&body, limit);
    if results.is_empty() {
        return Ok("No results.".into());
    }
    let out = results
        .iter()
        .enumerate()
        .map(|(i, (title, url, snippet))| {
            let snip = if snippet.is_empty() {
                String::new()
            } else {
                format!("\n   {snippet}")
            };
            format!("{}. {title}\n   {url}{snip}", i + 1)
        })
        .collect::<Vec<_>>()
        .join("\n\n");
    Ok(cap(out))
}

/// GET a URL and return readable text (HTML stripped to text; other text types
/// passed through; binary refused).
pub async fn web_fetch(url: &str) -> Result<String, String> {
    let url = url.trim();
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return Err("url must start with http:// or https://".into());
    }
    let resp = http_client()?
        .get(url)
        .send()
        .await
        .map_err(|e| format!("fetch failed: {e}"))?;
    let status = resp.status();
    if !status.is_success() {
        return Err(format!("fetch failed: HTTP {status}"));
    }
    let ctype = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_lowercase();
    let final_url = resp.url().to_string();
    let body = resp
        .text()
        .await
        .map_err(|e| format!("reading response failed: {e}"))?;
    let text = if ctype.contains("html") || (ctype.is_empty() && looks_like_html(&body)) {
        strip_tags(&body)
    } else if ctype.is_empty()
        || ctype.contains("text")
        || ctype.contains("json")
        || ctype.contains("xml")
        || ctype.contains("markdown")
    {
        collapse_ws(&body)
    } else {
        return Err(format!(
            "unsupported content type: {ctype} — web_fetch returns text only."
        ));
    };
    let text = text.trim();
    if text.is_empty() {
        return Ok(format!("{final_url} returned no readable text."));
    }
    Ok(cap(format!("{final_url}\n\n{text}")))
}

fn looks_like_html(s: &str) -> bool {
    let head = s.trim_start().to_lowercase();
    head.starts_with("<!doctype html") || head.starts_with("<html") || head.contains("<body")
}

// ---- DuckDuckGo result parsing -------------------------------------------

/// Pull (title, url, snippet) triples out of the DDG HTML response. Anchored on
/// the `result__a` link class; the snippet on the sibling `result__snippet`.
fn parse_ddg(html: &str, limit: usize) -> Vec<(String, String, String)> {
    let lower = html.to_lowercase();
    let mut out = Vec::new();
    let mut pos = 0;
    while out.len() < limit {
        let Some(rel) = lower[pos..].find("result__a") else {
            break;
        };
        let idx = pos + rel;
        // The enclosing <a …> tag, and its closing </a>.
        let Some(tag_start) = html[..idx].rfind("<a") else {
            pos = idx + "result__a".len();
            continue;
        };
        let Some(tag_end_rel) = html[idx..].find('>') else {
            break;
        };
        let tag_end = idx + tag_end_rel;
        let url = attr_value(&html[tag_start..tag_end], "href")
            .map(|h| clean_ddg_url(&h))
            .unwrap_or_default();
        let text_start = tag_end + 1;
        let Some(close_rel) = html[text_start..].find("</a>") else {
            break;
        };
        let title = strip_tags(&html[text_start..text_start + close_rel]);
        let after = text_start + close_rel;
        let snippet = snippet_after(html, &lower, after);
        if !url.is_empty() && !title.is_empty() {
            out.push((title, url, snippet));
        }
        pos = after + 4;
    }
    out
}

/// Text of the next `result__snippet` anchor after `from`, if any.
fn snippet_after(html: &str, lower: &str, from: usize) -> String {
    let Some(rel) = lower[from..].find("result__snippet") else {
        return String::new();
    };
    let si = from + rel;
    let Some(ge) = html[si..].find('>') else {
        return String::new();
    };
    let ts = si + ge + 1;
    match html[ts..].find("</a>") {
        Some(ce) => strip_tags(&html[ts..ts + ce]),
        None => String::new(),
    }
}

/// Value of `name="…"` inside one tag's text (entity-decoded).
fn attr_value(tag: &str, name: &str) -> Option<String> {
    let needle = format!("{name}=\"");
    let start = tag.find(&needle)? + needle.len();
    let end = tag[start..].find('"')? + start;
    Some(html_entity_decode(&tag[start..end]))
}

/// DDG wraps result links as `//duckduckgo.com/l/?uddg=<percent-encoded>`.
/// Unwrap to the real target; otherwise normalise a protocol-relative URL.
fn clean_ddg_url(href: &str) -> String {
    if let Some(at) = href.find("uddg=") {
        let rest = &href[at + 5..];
        let val = rest.split('&').next().unwrap_or(rest);
        return percent_decode(val);
    }
    if let Some(stripped) = href.strip_prefix("//") {
        return format!("https://{stripped}");
    }
    href.to_string()
}

// ---- HTML → text helpers --------------------------------------------------

fn strip_tags(html: &str) -> String {
    let s = remove_block(html, "script");
    let s = remove_block(&s, "style");
    let mut out = String::with_capacity(s.len());
    let mut tag = String::new();
    let mut in_tag = false;
    for ch in s.chars() {
        match ch {
            '<' => {
                in_tag = true;
                tag.clear();
            }
            // Block/break tags become a newline so words don't run together;
            // collapse_ws folds the runs that produces.
            '>' => {
                in_tag = false;
                if is_break_tag(&tag) {
                    out.push('\n');
                }
            }
            _ if in_tag => tag.push(ch),
            _ => out.push(ch),
        }
    }
    collapse_ws(&html_entity_decode(&out))
}

fn is_break_tag(tag: &str) -> bool {
    let t = tag.trim_start_matches('/').trim_start();
    let name: String = t
        .chars()
        .take_while(|c| c.is_ascii_alphanumeric())
        .collect();
    matches!(
        name.to_ascii_lowercase().as_str(),
        "p" | "br"
            | "div"
            | "li"
            | "tr"
            | "h1"
            | "h2"
            | "h3"
            | "h4"
            | "h5"
            | "h6"
            | "section"
            | "article"
            | "header"
            | "footer"
            | "ul"
            | "ol"
            | "table"
            | "blockquote"
    )
}

/// Drop every `<tag …>…</tag>` block (case-insensitive).
fn remove_block(s: &str, tag: &str) -> String {
    let lower = s.to_lowercase();
    let open = format!("<{tag}");
    let close = format!("</{tag}>");
    let mut out = String::with_capacity(s.len());
    let mut i = 0;
    while i < s.len() {
        match lower[i..].find(&open) {
            Some(rel) => {
                let start = i + rel;
                out.push_str(&s[i..start]);
                match lower[start..].find(&close) {
                    Some(crel) => i = start + crel + close.len(),
                    None => i = s.len(),
                }
            }
            None => {
                out.push_str(&s[i..]);
                break;
            }
        }
    }
    out
}

/// Collapse whitespace runs: a run containing a newline becomes one `\n`,
/// otherwise one space. Keeps paragraph structure without blank-line sprawl.
fn collapse_ws(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut ws = false;
    let mut had_nl = false;
    for ch in s.chars() {
        if ch.is_whitespace() {
            ws = true;
            had_nl |= ch == '\n';
        } else {
            if ws {
                out.push(if had_nl { '\n' } else { ' ' });
            }
            ws = false;
            had_nl = false;
            out.push(ch);
        }
    }
    out.trim().to_string()
}

fn html_entity_decode(s: &str) -> String {
    if !s.contains('&') {
        return s.to_string();
    }
    let mut out = String::with_capacity(s.len());
    let mut i = 0;
    while i < s.len() {
        if s.as_bytes()[i] == b'&' {
            if let Some(semi) = s[i..].find(';').filter(|&n| n <= 10) {
                if let Some(rep) = decode_entity(&s[i + 1..i + semi]) {
                    out.push_str(&rep);
                    i += semi + 1;
                    continue;
                }
            }
        }
        let ch = s[i..].chars().next().unwrap();
        out.push(ch);
        i += ch.len_utf8();
    }
    out
}

fn decode_entity(ent: &str) -> Option<String> {
    let named = match ent {
        "amp" => "&",
        "lt" => "<",
        "gt" => ">",
        "quot" => "\"",
        "apos" | "#39" => "'",
        "nbsp" => " ",
        "mdash" => "—",
        "ndash" => "–",
        "hellip" => "…",
        "rsquo" | "#8217" => "’",
        "lsquo" | "#8216" => "‘",
        "ldquo" | "#8220" => "“",
        "rdquo" | "#8221" => "”",
        _ => "",
    };
    if !named.is_empty() {
        return Some(named.to_string());
    }
    let num = ent.strip_prefix('#')?;
    let code = if let Some(hex) = num.strip_prefix(['x', 'X']) {
        u32::from_str_radix(hex, 16).ok()?
    } else {
        num.parse().ok()?
    };
    char::from_u32(code).map(String::from)
}

fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'%' if i + 3 <= bytes.len() => match u8::from_str_radix(&s[i + 1..i + 3], 16) {
                Ok(b) => {
                    out.push(b);
                    i += 3;
                }
                Err(_) => {
                    out.push(b'%');
                    i += 1;
                }
            },
            b'+' => {
                out.push(b' ');
                i += 1;
            }
            b => {
                out.push(b);
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_tags_scripts_and_entities() {
        let html = "<html><head><style>p{color:red}</style></head><body>\
            <script>var x=1<2;</script><p>Hello&nbsp;&amp; welcome</p>\
            <p>line&#39;s end</p></body></html>";
        let text = strip_tags(html);
        assert_eq!(text, "Hello & welcome\nline's end");
    }

    #[test]
    fn unwraps_ddg_redirect_url() {
        let href = "//duckduckgo.com/l/?uddg=https%3A%2F%2Fen.wikipedia.org%2Fwiki%2FOdin&rut=abc";
        assert_eq!(clean_ddg_url(href), "https://en.wikipedia.org/wiki/Odin");
        assert_eq!(clean_ddg_url("//example.com/x"), "https://example.com/x");
    }

    #[test]
    fn parses_ddg_result_block() {
        let html = r#"<div class="result">
            <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fa.test%2Fp">Title One</a>
            <a class="result__snippet" href="x">Snippet&nbsp;text here</a>
            </div>"#;
        let r = parse_ddg(html, 5);
        assert_eq!(r.len(), 1);
        assert_eq!(r[0].0, "Title One");
        assert_eq!(r[0].1, "https://a.test/p");
        assert_eq!(r[0].2, "Snippet text here");
    }
}
