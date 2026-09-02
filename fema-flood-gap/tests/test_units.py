import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fema_flood import cpi, schema, states
from fema_flood.analysis import Accumulator
from fema_flood.declarations import shift_days


class TestStates(unittest.TestCase):
    def test_accepts_codes_and_names(self):
        self.assertEqual(states.resolve("la"), "LA")
        self.assertEqual(states.resolve("Louisiana"), "LA")
        self.assertEqual(states.resolve(" new jersey "), "NJ")
        self.assertEqual(states.resolve("Puerto Rico"), "PR")

    def test_rejects_garbage(self):
        with self.assertRaises(states.UnknownState):
            states.resolve("Atlantis")


class TestCoercion(unittest.TestCase):
    def test_truthy_encodings(self):
        for value in (1, "1", "Y", "Yes", True, "true"):
            self.assertIs(schema.truthy(value), True, value)
        for value in (0, "0", "N", "No", False, "false"):
            self.assertIs(schema.truthy(value), False, value)
        for value in (None, "", "maybe"):
            self.assertIsNone(schema.truthy(value), value)

    def test_number_and_dates(self):
        self.assertEqual(schema.number("1,234.50"), 1234.5)
        self.assertIsNone(schema.number("n/a"))
        self.assertIsNone(schema.number(True))
        self.assertEqual(schema.year_of("2016-08-11T00:00:00.000Z"), 2016)
        self.assertEqual(schema.date_key("2016-08-11T00:00:00.000Z"), "2016-08-11")
        self.assertIsNone(schema.date_key("August 2016"))


class TestOwnerMatching(unittest.TestCase):
    def test_letter_codes_and_spelled_out_values(self):
        from fema_flood.analysis import is_owner
        for value in ("O", "o", " O ", "Owner", "owner", "OWNER", "Own"):
            self.assertIs(is_owner(value), True, value)
        for value in ("R", "r", "Renter", "renter", "Rent"):
            self.assertIs(is_owner(value), False, value)
        for value in (None, "", "Unknown", "U"):
            self.assertIsNone(is_owner(value), value)


class TestAccumulator(unittest.TestCase):
    def setUp(self):
        self.acc = Accumulator()
        for value in (0.0, 100.0, 200.0, None, 700.0):
            self.acc.add(value)

    def test_two_denominators(self):
        self.assertEqual(self.acc.n, 5)
        self.assertEqual(self.acc.total, 1000.0)
        self.assertEqual(self.acc.mean, 200.0)
        self.assertEqual(self.acc.n_positive, 3)
        self.assertAlmostEqual(self.acc.mean_positive, 1000.0 / 3)
        self.assertAlmostEqual(self.acc.share_positive, 0.6)

    def test_percentiles(self):
        self.assertEqual(self.acc.percentile(50), 100.0)
        self.assertEqual(self.acc.percentile(50, positive_only=True), 200.0)
        self.assertEqual(self.acc.percentile(100, positive_only=True), 700.0)

    def test_merge(self):
        other = Accumulator()
        other.add(1000.0)
        self.acc.merge(other)
        self.assertEqual(self.acc.n, 6)
        self.assertEqual(self.acc.total, 2000.0)
        self.assertEqual(self.acc.percentile(50), 150.0)

    def test_empty(self):
        empty = Accumulator()
        self.assertIsNone(empty.mean)
        self.assertIsNone(empty.percentile(50))
        self.assertIsNone(empty.share_positive)


class TestDeflator(unittest.TestCase):
    def test_pass_through_when_inactive(self):
        deflator = cpi.Deflator()
        self.assertEqual(deflator.adjust(1000.0, 2005), 1000.0)
        self.assertIn("nominal", deflator.label())

    def test_scales_by_cpi_ratio(self):
        deflator = cpi.Deflator(2024)
        expected = 1000.0 * (cpi.CPI_U[2024] / cpi.CPI_U[2005])
        self.assertAlmostEqual(deflator.adjust(1000.0, 2005), expected)
        self.assertAlmostEqual(deflator.adjust(1000.0, 2024), 1000.0)

    def test_unknown_year_stays_nominal_and_is_recorded(self):
        deflator = cpi.Deflator(2024)
        self.assertEqual(deflator.adjust(1000.0, 1975), 1000.0)
        self.assertEqual(deflator.missing_years, {1975})
        self.assertEqual(deflator.adjust(1000.0, None), 1000.0)

    def test_rejects_unknown_base_year(self):
        with self.assertRaises(ValueError):
            cpi.Deflator(1850)

    def test_flags_provisional_base(self):
        self.assertTrue(cpi.Deflator(2025).provisional)
        self.assertFalse(cpi.Deflator(2024).provisional)


class TestDateWindow(unittest.TestCase):
    def test_shift_across_month_boundary(self):
        self.assertEqual(shift_days("2016-08-31", 3), "2016-09-03")
        self.assertEqual(shift_days("2016-03-01", -1), "2016-02-29")
        self.assertIsNone(shift_days(None, 3))


if __name__ == "__main__":
    unittest.main()


class TestInvocation(unittest.TestCase):
    """The CLI must run whether or not the user remembers `-m`."""

    ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    def _run(self, *args):
        import subprocess
        return subprocess.run([sys.executable, *args, "states"], cwd=self.ROOT,
                              capture_output=True, text=True)

    def test_module_form(self):
        result = self._run("-m", "fema_flood")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("LA  Louisiana", result.stdout)

    def test_directory_form_without_dash_m(self):
        result = self._run("fema_flood")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("LA  Louisiana", result.stdout)

    def test_directory_form_with_trailing_separator(self):
        # What shell tab-completion produces: `python fema_flood/`
        result = self._run("fema_flood" + os.sep)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("LA  Louisiana", result.stdout)
