#!/usr/bin/env python3
"""
Evidence Browser integration test suite.
Validates core API endpoints and evidence bundle processing.
"""

import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

import requests

BASE_URL = "http://localhost:3000/api/v1"
TEST_BUNDLE_PATH = Path(__file__).parent.parent / "fixtures" / "fixture-basic"


class TestEvidenceAPI(unittest.TestCase):
    """Integration tests for the Evidence API."""

    def setUp(self):
        self.session = requests.Session()
        self.session.headers.update({"Authorization": "Bearer test-token-abc123"})

    def tearDown(self):
        self.session.close()

    def test_health_check(self):
        resp = self.session.get(f"{BASE_URL}/health")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["status"], "ok")

    def test_upload_bundle(self):
        bundle_zip = TEST_BUNDLE_PATH / "bundle.zip"
        if not bundle_zip.exists():
            self.skipTest("Test bundle not built yet")
        with open(bundle_zip, "rb") as f:
            resp = self.session.post(f"{BASE_URL}/bundles", files={"file": f})
        self.assertEqual(resp.status_code, 201)
        self.assertIn("id", resp.json())

    def test_list_bundles(self):
        resp = self.session.get(f"{BASE_URL}/bundles")
        self.assertEqual(resp.status_code, 200)
        self.assertIsInstance(resp.json(), list)

    def test_get_bundle_manifest(self):
        resp = self.session.get(f"{BASE_URL}/bundles/1/manifest")
        if resp.status_code == 404:
            self.skipTest("No bundle uploaded yet")
        self.assertEqual(resp.status_code, 200)
        manifest = resp.json()
        self.assertIn("version", manifest)
        self.assertIn("title", manifest)


if __name__ == "__main__":
    unittest.main(verbosity=2)
