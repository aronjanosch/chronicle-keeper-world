"""Campaign helpers wrapping config storage."""

from __future__ import annotations

from app.storage.config import (
    create_campaign as _create_campaign,
    get_campaign as _get_campaign,
    get_campaigns as _get_campaigns,
    get_current_campaign_id,
    get_next_session_number,
    set_current_campaign_id,
    update_campaign as _update_campaign,
)


def list_campaigns() -> dict:
    campaigns = _get_campaigns()
    return {
        "campaigns": campaigns,
        "current_campaign_id": get_current_campaign_id(),
    }


def create_campaign(campaign_id: str, name: str, start_session_number: int = 1) -> dict:
    campaign = _create_campaign(campaign_id, name, start_session_number)
    set_current_campaign_id(campaign_id)
    return campaign


def next_session_number(campaign_id: str | None = None) -> int:
    return get_next_session_number(campaign_id)


def get_campaign_detail(campaign_id: str) -> dict:
    campaign = _get_campaign(campaign_id)
    if not campaign:
        raise KeyError(f"Campaign not found: {campaign_id}")
    return campaign


def update_campaign(campaign_id: str, updates: dict) -> dict:
    campaign = _update_campaign(campaign_id, updates)
    return campaign
