"""Capability and trigger policy for the Site Health acquisition ladder."""

from __future__ import annotations

from app.connectors.web_evidence import acquisition


def test_curl_pinned_resolution_probe_is_fail_closed_on_windows(monkeypatch) -> None:
    monkeypatch.setattr(acquisition.sys, "platform", "win32")
    assert acquisition.curl_cffi_pinned_resolution_supported() is False


def test_curl_pinned_resolution_probe_checks_installed_binding(monkeypatch) -> None:
    monkeypatch.setattr(acquisition.sys, "platform", "linux")
    assert acquisition.curl_cffi_pinned_resolution_supported() is True
