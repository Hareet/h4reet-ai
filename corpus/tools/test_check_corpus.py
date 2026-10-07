"""Tests for the corpus gate's currency rule. Pure logic: no corpus files are read."""

import importlib.util
from pathlib import Path

import pytest

_spec = importlib.util.spec_from_file_location(
    "check_corpus", Path(__file__).with_name("check_corpus.py")
)
check_corpus = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(check_corpus)


@pytest.mark.parametrize(
    "line",
    [
        "$50,000",
        "€10k",
        "£5",
        "50,000 USD",
        "5M USD",
        "USD 50,000",
        "EUR 10,000",
        "KES 5,000,000",
        "KSh 5m",
        "Ksh 200",
        "₹4,00,000",
        "Rs. 400000",
        "Rs 400",
        "INR 1,000",
        "NPR 250000",
        "1.2 million shillings",
        "40 lakh rupees",
        "10 dollars",
    ],
)
def test_flags_currency_amounts(line):
    assert check_corpus.CURRENCY.search(line)


@pytest.mark.parametrize(
    "line",
    [
        "The community delivers care to an estimated 90 million people.",
        "office hours and workshops",
        "a proof of concept in Q2 2026, then Q3 2026",
        "47+ organizations across 24 countries",
        "PRs 3 and 4 were merged",
        "a weight of 5 kg",
    ],
)
def test_ignores_numbers_that_are_not_money(line):
    assert not check_corpus.CURRENCY.search(line)
