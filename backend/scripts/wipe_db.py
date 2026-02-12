"""Wipe campaigns/sessions data from the SQLite database."""

from __future__ import annotations

from app.storage.db import get_connection, get_db_path


def wipe_database() -> None:
    with get_connection() as connection:
        connection.execute("DELETE FROM sessions")
        connection.execute("DELETE FROM campaigns")
        connection.execute("DELETE FROM config WHERE key = ?", ("campaigns_json",))
        connection.commit()


def main() -> None:
    db_path = get_db_path()
    wipe_database()
    print(f"Wiped campaigns/sessions in {db_path}")


if __name__ == "__main__":
    main()
