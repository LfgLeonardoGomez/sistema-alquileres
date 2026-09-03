"""Unit tests for `month_window`/`week_window` (design D9 "Interfaces" /
owner-dashboard spec "Weekly and Monthly Variants") -- pure functions, no
DB access, half-open `[from, to)` bounds throughout.
"""

from datetime import date

from app.services.dates import month_window, week_window


def test_month_window_returns_first_of_month_to_first_of_next_month() -> None:
    assert month_window(2026, 6) == (date(2026, 6, 1), date(2026, 7, 1))


def test_month_window_handles_december_year_rollover() -> None:
    """Triangulation: December must roll into January of the following
    year, not wrap to month 13 or month 0."""
    assert month_window(2026, 12) == (date(2026, 12, 1), date(2027, 1, 1))


def test_week_window_returns_monday_to_next_monday_for_a_mid_week_date() -> None:
    """2026-06-10 is a Wednesday; the ISO week runs Monday 2026-06-08
    through the following Monday 2026-06-15 (exclusive)."""
    assert week_window(date(2026, 6, 10)) == (date(2026, 6, 8), date(2026, 6, 15))


def test_week_window_is_idempotent_for_the_monday_itself() -> None:
    """Triangulation: passing the Monday itself must return that same
    Monday as the start, not the previous week."""
    assert week_window(date(2026, 6, 8)) == (date(2026, 6, 8), date(2026, 6, 15))


def test_week_window_handles_sunday_at_the_end_of_the_week() -> None:
    """Triangulation: a Sunday belongs to the week that started on the
    preceding Monday."""
    assert week_window(date(2026, 6, 14)) == (date(2026, 6, 8), date(2026, 6, 15))
