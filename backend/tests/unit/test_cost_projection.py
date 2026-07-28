from app.domain.audits.cost_projection import _cost_microusd, _non_negative_int


def test_cost_normalizers_treat_non_finite_values_as_zero() -> None:
    assert _non_negative_int(float("inf")) == 0
    assert _cost_microusd(float("inf")) == 0
