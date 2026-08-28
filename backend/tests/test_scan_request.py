"""Tests for how a scan request's photo paths are resolved.

Capture order is meaningful (it is what the officer saw, and what the notice
prints), and the legacy two-image fields have to keep working while a deploy
rolls out, so both are pinned here.
"""
import pytest

from app.api.scans import _image_paths
from app.schemas.scan import MAX_LABEL_IMAGES, ScanRequest


# --------------------------------------------------------------------------
# Request -> ordered paths
# --------------------------------------------------------------------------

def test_paths_keep_capture_order():
    req = ScanRequest(image_paths=["c.jpg", "a.jpg", "b.jpg"])
    assert req.resolved_paths() == ["c.jpg", "a.jpg", "b.jpg"]


@pytest.mark.parametrize("count", range(1, MAX_LABEL_IMAGES + 1))
def test_one_to_four_photos_are_accepted(count):
    req = ScanRequest(image_paths=[f"{i}.jpg" for i in range(count)])
    assert len(req.resolved_paths()) == count


def test_blank_and_whitespace_entries_are_dropped():
    req = ScanRequest(image_paths=["  front.jpg  ", "", "   ", "back.jpg"])
    assert req.resolved_paths() == ["front.jpg", "back.jpg"]


def test_no_photos_resolves_empty_so_the_endpoint_can_reject_it():
    assert ScanRequest().resolved_paths() == []


# --------------------------------------------------------------------------
# Legacy front/back fields
# --------------------------------------------------------------------------

def test_legacy_front_and_back_still_resolve():
    req = ScanRequest(front_path="front.jpg", back_path="back.jpg")
    assert req.resolved_paths() == ["front.jpg", "back.jpg"]


def test_legacy_front_only_resolves_to_one_photo():
    assert ScanRequest(front_path="front.jpg").resolved_paths() == ["front.jpg"]


def test_image_paths_wins_over_the_legacy_fields():
    req = ScanRequest(
        image_paths=["a.jpg", "b.jpg", "c.jpg"],
        front_path="old-front.jpg",
        back_path="old-back.jpg",
    )
    assert req.resolved_paths() == ["a.jpg", "b.jpg", "c.jpg"]


# --------------------------------------------------------------------------
# Stored row -> ordered paths
# --------------------------------------------------------------------------

def test_storage_path_is_the_canonical_record():
    row = {"storage_path": "a.jpg | b.jpg | c.jpg | d.jpg"}
    assert _image_paths(row) == ["a.jpg", "b.jpg", "c.jpg", "d.jpg"]


def test_storage_path_tolerates_ragged_spacing():
    row = {"storage_path": "  a.jpg|b.jpg |  c.jpg  "}
    assert _image_paths(row) == ["a.jpg", "b.jpg", "c.jpg"]


def test_single_image_row_resolves_to_one_path():
    assert _image_paths({"storage_path": "only.jpg"}) == ["only.jpg"]


def test_older_rows_fall_back_to_the_front_and_back_columns():
    row = {"storage_path": "", "front_path": "front.jpg", "back_path": "back.jpg"}
    assert _image_paths(row) == ["front.jpg", "back.jpg"]


def test_storage_path_is_preferred_over_the_legacy_columns():
    """A four-photo scan must not be truncated to the two legacy columns."""
    row = {
        "storage_path": "a.jpg | b.jpg | c.jpg | d.jpg",
        "front_path": "a.jpg",
        "back_path": "b.jpg",
    }
    assert _image_paths(row) == ["a.jpg", "b.jpg", "c.jpg", "d.jpg"]


def test_a_row_with_no_evidence_resolves_empty():
    assert _image_paths({}) == []
