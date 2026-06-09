//! World timeline (Phase 11): pages with a `date:` frontmatter field, sorted
//! on the world's calendar. Dates are numeric `year[-month[-day]]` with an
//! optional era suffix from `[calendar] eras` (`1374-08-12 DR`); month names
//! from `[calendar] months` are display-only.

use serde_json::{json, Value};

use crate::world_config::CalendarConfig;

#[derive(Debug, PartialEq)]
pub struct WorldDate {
    pub era_idx: usize, // position in the configured eras; no suffix → 0
    pub era: Option<String>,
    pub year: i64,
    pub month: u32, // 0 = unset
    pub day: u32,   // 0 = unset
}

pub fn parse_world_date(raw: &str, eras: &[String]) -> Option<WorldDate> {
    let mut s = raw.trim();
    let mut era = None;
    let mut era_idx = 0usize;
    for (i, e) in eras.iter().enumerate() {
        let lower = s.to_lowercase();
        if let Some(rest) = lower.strip_suffix(&e.to_lowercase()) {
            if rest.ends_with(' ') {
                s = s[..rest.len()].trim_end();
                era = Some(e.clone());
                era_idx = i;
                break;
            }
        }
    }
    let mut parts = s.split('-');
    let year: i64 = parts.next()?.trim().parse().ok()?;
    let month: u32 = match parts.next() {
        Some(p) => p.trim().parse().ok()?,
        None => 0,
    };
    let day: u32 = match parts.next() {
        Some(p) => p.trim().parse().ok()?,
        None => 0,
    };
    if parts.next().is_some() {
        return None;
    }
    Some(WorldDate { era_idx, era, year, month, day })
}

pub fn display(d: &WorldDate, months: &[String]) -> String {
    let name = (d.month >= 1 && (d.month as usize) <= months.len())
        .then(|| months[d.month as usize - 1].as_str());
    let mut s = match (name, d.month, d.day) {
        (Some(n), _, 0) => format!("{} {}", n, d.year),
        (Some(n), _, day) => format!("{} {} {}", day, n, d.year),
        (None, 0, _) => d.year.to_string(),
        (None, m, 0) => format!("{}-{m:02}", d.year),
        (None, m, day) => format!("{}-{m:02}-{day:02}", d.year),
    };
    if let Some(e) = &d.era {
        s.push(' ');
        s.push_str(e);
    }
    s
}

/// Dated pages → sorted timeline entries. `rows` = (path, title, kind,
/// frontmatter_json) from the index; pages without a parseable `date` drop out.
pub fn world_events(
    rows: Vec<crate::store::index::PageFrontmatter>,
    cal: &CalendarConfig,
) -> Vec<Value> {
    let mut dated: Vec<(WorldDate, Value)> = rows
        .into_iter()
        .filter_map(|(path, title, kind, fm)| {
            let fm: Value = serde_json::from_str(&fm).ok()?;
            let raw = match &fm["date"] {
                Value::String(s) => s.clone(),
                Value::Array(a) => a.first()?.as_str()?.to_string(),
                _ => return None,
            };
            let d = parse_world_date(&raw, &cal.eras)?;
            let summary = fm["summary"].as_str().unwrap_or("").to_string();
            let entry = json!({
                "path": path,
                "title": title,
                "kind": kind,
                "date": raw,
                "display": display(&d, &cal.months),
                "era": d.era,
                "year": d.year,
                "summary": summary,
            });
            Some((d, entry))
        })
        .collect();
    dated.sort_by(|(a, av), (b, bv)| {
        (a.era_idx, a.year, a.month, a.day, av["title"].as_str())
            .cmp(&(b.era_idx, b.year, b.month, b.day, bv["title"].as_str()))
    });
    dated.into_iter().map(|(_, v)| v).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cal(months: &[&str], eras: &[&str]) -> CalendarConfig {
        CalendarConfig {
            months: months.iter().map(|s| s.to_string()).collect(),
            eras: eras.iter().map(|s| s.to_string()).collect(),
        }
    }

    #[test]
    fn parses_and_displays() {
        let c = cal(&["Hammer", "Alturiak"], &["DR", "NR"]);
        let d = parse_world_date("1374-02-12 DR", &c.eras).unwrap();
        assert_eq!((d.era_idx, d.year, d.month, d.day), (0, 1374, 2, 12));
        assert_eq!(display(&d, &c.months), "12 Alturiak 1374 DR");
        let d = parse_world_date("1374", &c.eras).unwrap();
        assert_eq!(display(&d, &c.months), "1374");
        let d = parse_world_date("212-05", &[]).unwrap();
        assert_eq!(display(&d, &[]), "212-05");
        assert!(parse_world_date("not a date", &c.eras).is_none());
        assert!(parse_world_date("1374-1-2-3", &c.eras).is_none());
    }

    #[test]
    fn events_sort_on_era_then_date() {
        let c = cal(&[], &["DR", "NR"]);
        let rows = vec![
            ("a.md".into(), "Late".into(), Some("event".into()), r#"{"date":"5 NR"}"#.into()),
            ("b.md".into(), "Early".into(), Some("event".into()), r#"{"date":"1374-08 DR"}"#.into()),
            ("c.md".into(), "Undated".into(), None, r#"{}"#.into()),
            ("d.md".into(), "Mid".into(), Some("event".into()), r#"{"date":"1374-09-01 DR"}"#.into()),
        ];
        let ev = world_events(rows, &c);
        let titles: Vec<&str> = ev.iter().map(|e| e["title"].as_str().unwrap()).collect();
        assert_eq!(titles, ["Early", "Mid", "Late"]);
    }
}
