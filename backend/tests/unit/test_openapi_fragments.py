"""Route-family fragment extraction for the TypeScript OpenAPI parity gate."""

from __future__ import annotations

from scripts.openapi_fragments import family_fragment


def test_fragment_keeps_path_level_fields_and_only_the_family() -> None:
    shared = [{"name": "project_id", "in": "path", "required": True}]
    spec = {
        "openapi": "3.1.0",
        "paths": {
            "/api/v1/projects/{project_id}/items": {
                "parameters": shared,
                "get": {
                    "tags": ["items"],
                    "responses": {
                        "200": {"$ref": "#/components/schemas/ItemList"},
                    },
                },
                "post": {"tags": ["other"], "responses": {}},
            },
            "/api/v1/other": {"parameters": [], "get": {"tags": ["other"]}},
        },
        "components": {
            "schemas": {
                "ItemList": {"items": {"$ref": "#/components/schemas/Item"}},
                "Item": {"type": "object"},
                "Unused": {"type": "object"},
            }
        },
    }

    fragment = family_fragment(spec, "items")

    assert fragment["paths"] == {
        "/api/v1/projects/{project_id}/items": {
            "parameters": shared,
            "get": spec["paths"]["/api/v1/projects/{project_id}/items"]["get"],
        }
    }
    assert list(fragment["components"]["schemas"]) == ["Item", "ItemList"]
