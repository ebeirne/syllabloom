from __future__ import annotations

import unittest
from unittest.mock import patch

from api.ai_card_generation import AIMonthlyBudgetLimitError, AIUsageLimitError, AIUsageUnavailable
from api.ai_usage import GLOBAL_MONTHLY_BUDGET_MICRODOLLARS, reserve_ai_usage


class FakeCursor:
    rowcount = 0

    def __init__(self, row: tuple[int] | None = (1,)) -> None:
        self.row = row

    def fetchone(self) -> tuple[int] | None:
        return self.row


class FakeConnection:
    def __init__(self, inserted_rows: list[tuple[int] | None] | None = None) -> None:
        self.statements: list[tuple[str, tuple | None]] = []
        self.inserted_rows = list(inserted_rows or [(1,), (2,), (3,)])

    def __enter__(self) -> FakeConnection:
        return self

    def __exit__(self, *_: object) -> None:
        return None

    def execute(self, sql: str, params: tuple | None = None) -> FakeCursor:
        self.statements.append((sql, params))
        if "INSERT INTO syllabloom_ai_usage_daily" in sql or "INSERT INTO syllabloom_ai_usage_monthly" in sql:
            return FakeCursor(self.inserted_rows.pop(0))
        return FakeCursor()


class AIUsageLimitTests(unittest.TestCase):
    def test_reserves_global_and_hashed_user_budget_atomically(self) -> None:
        connection = FakeConnection()
        with patch("api.ai_usage._database_url", return_value="postgresql://test.invalid"), \
             patch("api.ai_usage.psycopg.connect", return_value=connection):
            reserve_ai_usage("user_private_subject", 48_000, 15_000)

        inserts = [(sql, params) for sql, params in connection.statements if "INSERT INTO syllabloom_ai_usage_daily" in sql]
        self.assertEqual(len(inserts), 2)
        self.assertEqual(inserts[0][1][1], "global")
        self.assertEqual(inserts[0][1][2:], (48_000, 1_000_000))
        self.assertTrue(inserts[1][1][1].startswith("user:"))
        self.assertNotIn("user_private_subject", str(inserts[1][1]))
        self.assertEqual(inserts[1][1][2:], (48_000, 192_000))
        self.assertTrue(any("90 days" in sql for sql, _ in connection.statements))
        monthly = [(sql, params) for sql, params in connection.statements if "INSERT INTO syllabloom_ai_usage_monthly" in sql]
        self.assertEqual(len(monthly), 1)
        self.assertEqual(monthly[0][1][1:], (15_000, GLOBAL_MONTHLY_BUDGET_MICRODOLLARS))

    def test_daily_limit_rejects_without_calling_any_other_budget_scope(self) -> None:
        connection = FakeConnection(inserted_rows=[None])
        with patch("api.ai_usage._database_url", return_value="postgresql://test.invalid"), \
             patch("api.ai_usage.psycopg.connect", return_value=connection):
            with self.assertRaises(AIUsageLimitError):
                reserve_ai_usage("user_private_subject", 48_000, 15_000)
        self.assertEqual(sum("INSERT INTO" in sql for sql, _ in connection.statements), 1)

    def test_monthly_budget_rejects_over_budget_before_provider_call(self) -> None:
        connection = FakeConnection(inserted_rows=[(1,), (2,), None])
        with patch("api.ai_usage._database_url", return_value="postgresql://test.invalid"), \
             patch("api.ai_usage.psycopg.connect", return_value=connection):
            with self.assertRaises(AIMonthlyBudgetLimitError):
                reserve_ai_usage("user_private_subject", 1_000, 1_000_000)
        self.assertEqual(sum("INSERT INTO" in sql for sql, _ in connection.statements), 3)

    def test_missing_database_fails_closed(self) -> None:
        with patch("api.ai_usage._database_url", return_value=""):
            with self.assertRaises(AIUsageUnavailable):
                reserve_ai_usage("user_private_subject", 1_000, 1_000)


if __name__ == "__main__":
    unittest.main()
