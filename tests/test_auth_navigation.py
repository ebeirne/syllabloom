from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]


class AuthNavigationContractTests(unittest.TestCase):
    def test_auth_refresh_waits_for_clerk_resolution(self):
        auth = (ROOT / "auth.js").read_text(encoding="utf-8")

        self.assertIn("refresh: () => clerk ? updateAuthState() : false", auth)
        self.assertIn("if (!clerk) return false", auth)
        self.assertIn("button.textContent = 'Checking account'", auth)
        self.assertIn("button.removeAttribute('aria-busy')", auth)

    def test_back_navigation_restores_the_app_shell(self):
        app = (ROOT / "app.js").read_text(encoding="utf-8")

        self.assertIn("window.addEventListener('popstate'", app)
        self.assertIn("restoreShellRoute(event.state?.syllabloom", app)
        self.assertIn("syncShellHistory('landing'", app)
        self.assertIn("window.SyllabloomAuth?.refresh?.()", app)
        self.assertIn("initializeShellRouting();", app)


if __name__ == "__main__":
    unittest.main()
