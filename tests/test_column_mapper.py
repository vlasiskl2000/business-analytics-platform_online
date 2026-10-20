"""Tests for backend/column_mapper.py (needs only pandas + openpyxl)."""
import sys
from datetime import datetime
from io import BytesIO
from pathlib import Path

import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend import column_mapper as cm


def xlsx_bytes(rows, header=None, title=None, sheet="Φύλλο1", extra_sheet=False):
    """Build an .xlsx in memory. rows: list of lists; title: optional text row above the header."""
    lines = []
    if title:
        lines += [[title], []]
    if header:
        lines.append(header)
    lines += rows
    buffer = BytesIO()
    with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
        pd.DataFrame(lines).to_excel(writer, sheet_name=sheet, header=False, index=False)
        if extra_sheet:
            pd.DataFrame([["x"], [1]]).to_excel(writer, sheet_name="Notes", header=False, index=False)
    return buffer.getvalue()


def run(contents, filename, mapping=None):
    table = cm.read_table(contents, filename)
    suggestion = cm.suggest_mapping(table)
    final, warnings = cm.apply_mapping(table, mapping or suggestion["mapping"])
    return table, suggestion, final, warnings


def test_standard_six_column_csv_still_works():
    csv = b"date,product,region,sales,cost,units\n2025-01-05,Laptop,Athens,1000,600,2\n2025-02-05,Mouse,Larissa,50,20,5\n"
    _, s, final, warnings = run(csv, "sales.csv")
    assert s["mapping"] == {"date": "date", "sales": "sales", "product": "product",
                            "region": "region", "cost": "cost", "units": "units", "profit": None}
    assert list(final.columns) == cm.STANDARD_COLUMNS
    assert final["sales"].tolist() == [1000, 50]
    assert warnings == []


def test_greek_excel_with_title_row_excel_dates_and_extra_columns():
    rows = [
        [datetime(2025, 1, 15), "Καφές", "Θεσσαλονίκη", 1250.5, 800, 40, "ok", 7],
        [datetime(2025, 2, 15), "Τσάι", "Αθήνα", 980.0, 500, 30, "ok", 8],
        [datetime(2025, 3, 15), "Καφές", "Αθήνα", 1500.0, 900, 50, "late", 9],
    ]
    header = ["Ημερομηνία", "Προϊόν", "Πόλη", "Πωλήσεις", "Κόστος", "Τεμάχια", "Σχόλια", "Αριθμός"]
    table, s, final, warnings = run(xlsx_bytes(rows, header, title="Αναφορά πωλήσεων 2025"), "report.xlsx")
    assert list(table.columns)[0] == "Ημερομηνία"          # title row skipped
    assert s["mapping"]["date"] == "Ημερομηνία"
    assert s["mapping"]["sales"] == "Πωλήσεις"
    assert s["mapping"]["product"] == "Προϊόν"
    assert s["mapping"]["region"] == "Πόλη"
    assert s["mapping"]["cost"] == "Κόστος"
    assert s["mapping"]["units"] == "Τεμάχια"
    assert final["sales"].sum() == pytest.approx(3730.5)
    assert sorted(final["product"].unique()) == ["Καφές", "Τσάι"]
    assert final["date"].iloc[0] == pd.Timestamp("2025-01-15")


def test_european_numbers_semicolon_and_day_first_dates():
    csv = ("Date;Item;Store;Amount;Qty\n"
           "15/01/2025;Shoes;Online;1.234,50;3\n"
           "20/02/2025;Shoes;Shop;2.000,00;4\n"
           "03/03/2025;Hat;Shop;99,9;1\n").encode("utf-8")
    _, s, final, warnings = run(csv, "data.csv")
    assert s["mapping"]["date"] == "Date" and s["mapping"]["sales"] == "Amount"
    assert s["mapping"]["product"] == "Item" and s["mapping"]["region"] == "Store"
    assert s["mapping"]["units"] == "Qty" and s["mapping"]["cost"] is None
    assert final["sales"].tolist() == [1234.5, 2000.0, 99.9]
    assert final["date"].dt.month.tolist() == [1, 2, 3]       # 15/01 read as 15 January
    assert any("No cost column" in w for w in warnings)


def test_windows_greek_encoding_cp1253():
    text = "Ημερομηνία;Κατηγορία;Έσοδα\n2025-01-01;Καφές;100\n2025-01-02;Τσάι;50\n"
    _, s, final, _ = run(text.encode("cp1253"), "greek.csv")
    assert s["mapping"]["sales"] == "Έσοδα" and s["mapping"]["product"] == "Κατηγορία"
    assert sorted(final["product"].unique()) == ["Καφές", "Τσάι"]


def test_minimal_file_only_date_and_amount():
    csv = b"Day,Total\n2025-01-01,10\n2025-01-02,20\n"
    _, s, final, warnings = run(csv, "min.csv")
    assert s["mapping"]["date"] == "Day" and s["mapping"]["sales"] == "Total"
    assert set(final["product"]) == {"All products"} and set(final["region"]) == {"All regions"}
    assert final["units"].tolist() == [1.0, 1.0]
    assert len(warnings) >= 3


def test_month_column_and_currency_symbols():
    csv = b"Month,Category,Revenue\n2025-01,Food,\xe2\x82\xac1,200\n".replace(b"\xe2\x82\xac1,200", b'"\xe2\x82\xac1,200"')
    csv += b'2025-02,Food,"\xe2\x82\xac1,350"\n'
    _, s, final, _ = run(csv, "m.csv")
    assert s["mapping"]["date"] == "Month"
    assert final["sales"].tolist() == [1200.0, 1350.0]


def test_rows_with_bad_values_are_skipped_with_warning():
    csv = b"date,sales\n2025-01-01,10\nnot a date,20\n2025-01-03,\n2025-01-04,40\n2025-01-05,50\n2025-01-06,60\n2025-01-07,70\n2025-01-08,80\n2025-01-09,90\n2025-01-10,100\n"
    _, _, final, warnings = run(csv, "bad.csv")
    assert len(final) == 8
    assert any("skipped" in w for w in warnings)


def test_user_can_override_the_suggestion():
    csv = b"date,a,b,c\n2025-01-01,10,20,x\n2025-01-02,30,40,y\n"
    table = cm.read_table(csv, "o.csv")
    final, _ = cm.apply_mapping(table, {"date": "date", "sales": "b", "cost": "a", "product": "c"})
    assert final["sales"].tolist() == [20, 40] and final["cost"].tolist() == [10, 30]


def test_errors_are_clear():
    table = cm.read_table(b"date,name,amount\n2025-01-01,x,10\n2025-01-02,y,20\n", "e.csv")
    with pytest.raises(cm.MappingError, match="sales"):
        cm.apply_mapping(table, {"date": "date"})
    with pytest.raises(cm.MappingError, match="does not look like dates"):
        cm.apply_mapping(table, {"date": "name", "sales": "amount"})
    with pytest.raises(cm.MappingError, match="does not look like numbers"):
        cm.apply_mapping(table, {"date": "date", "sales": "name"})
    with pytest.raises(cm.MappingError, match="same column"):
        cm.apply_mapping(table, {"date": "date", "sales": "amount", "cost": "amount"})
    with pytest.raises(cm.MappingError, match="not found"):
        cm.apply_mapping(table, {"date": "date", "sales": "nope"})
    with pytest.raises(cm.MappingError, match=".xlsx"):
        cm.read_table(b"x", "old.xls")
    with pytest.raises(cm.MappingError, match="Excel"):
        cm.read_table(b"not really excel", "broken.xlsx")


def test_sheets_and_description():
    contents = xlsx_bytes([[datetime(2025, 1, 1), "A", 5]], ["Date", "Category", "Sales"], extra_sheet=True)
    assert cm.list_sheets(contents, "b.xlsx") == ["Φύλλο1", "Notes"]
    info = cm.describe_columns(cm.read_table(contents, "b.xlsx"))
    kinds = {c["name"]: c["kind"] for c in info}
    assert kinds == {"Date": "date", "Category": "text", "Sales": "number"}
    assert info[1]["top_values"][0]["value"] == "A"


def test_summary_lists_categories():
    csv = b"date,category,city,sales\n2025-01-01,Food,Athens,1\n2025-01-02,Drinks,Athens,2\n"
    _, _, final, _ = run(csv, "s.csv")
    s = cm.summarize(final)
    assert s["products"] == ["Drinks", "Food"] and s["regions"] == ["Athens"] and s["rows"] == 2


def test_profit_column_is_used_to_derive_cost():
    csv = (b"Order ID,Order Date,Ship Date,Category,Sub-Category,Region,Sales,Quantity,Discount,Profit\n"
           b"CA-1,2025-01-05,2025-01-09,Furniture,Chairs,West,261.96,2,0,41.91\n"
           b"CA-2,2025-02-05,2025-02-08,Technology,Phones,East,731.94,3,0,219.58\n"
           b"CA-3,2025-02-15,2025-02-18,Technology,Phones,East,14.62,2,0,6.87\n")
    _, s, final, warnings = run(csv, "superstore.csv")
    m = s["mapping"]
    assert m["date"] == "Order Date" and m["sales"] == "Sales" and m["units"] == "Quantity"
    assert m["product"] == "Category" and m["region"] == "Region" and m["profit"] == "Profit" and m["cost"] is None
    assert final["cost"].iloc[0] == pytest.approx(261.96 - 41.91)
    assert any("Cost was calculated" in w for w in warnings)
