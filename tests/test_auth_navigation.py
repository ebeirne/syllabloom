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

    def test_each_workspace_view_owns_a_reloadable_url(self):
        app = (ROOT / "app.js").read_text(encoding="utf-8")

        self.assertIn("const routeUrl = `${window.location.pathname}${window.location.search}#${routeHash}`;", app)
        self.assertLess(app.index("if (appViews.has(hashView))"), app.index("if (current?.surface)"))
        self.assertIn("function navigate(view, historyMode = 'push')", app)
        self.assertNotIn("pushState'](snapshot, '', window.location.href)", app)

    def test_review_only_lecture_cards_route_to_the_real_review_page(self):
        app = (ROOT / "app.js").read_text(encoding="utf-8")

        self.assertNotIn("navigate('queue')", app)
        self.assertIn("document.querySelector('#lectureDraftSection')?.scrollIntoView", app)


if __name__ == "__main__":
    unittest.main()
