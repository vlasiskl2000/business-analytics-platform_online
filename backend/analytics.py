from .data_loader import load_sales_data


def calculate_kpis(data):

    total_revenue = data["sales"].sum()
    total_cost = data["cost"].sum()
    total_profit = total_revenue - total_cost

    profit_margin = (total_profit / total_revenue) * 100

    total_units = data["units"].sum()
    average_sale = data["sales"].mean()

    return {
    "total_revenue": float(total_revenue),
    "total_cost": float(total_cost),
    "total_profit": float(total_profit),
    "profit_margin": float(profit_margin),
    "total_units": int(total_units),
    "average_sale": float(average_sale)
}
def sales_by_product(data):

    result = data.groupby("product").agg(
        revenue=("sales", "sum"),
        cost=("cost", "sum"),
        units=("units", "sum")
    )

    result["profit"] = result["revenue"] - result["cost"]

    result["margin"] = (
        result["profit"] / result["revenue"]
    ) * 100

    return result.sort_values("revenue", ascending=False)


def sales_by_region(data):

    result = data.groupby("region").agg(
        revenue=("sales", "sum"),
        cost=("cost", "sum"),
        units=("units", "sum")
    )

    result["profit"] = result["revenue"] - result["cost"]

    result["margin"] = (
        result["profit"] / result["revenue"]
    ) * 100

    return result.sort_values("revenue", ascending=False)
def monthly_sales(data):

    result = data.groupby(
        data["date"].dt.to_period("M")
    ).agg(
        revenue=("sales", "sum"),
        cost=("cost", "sum"),
        units=("units", "sum")
    )

    result["profit"] = result["revenue"] - result["cost"]

    result["margin"] = (
        result["profit"] / result["revenue"]
    ) * 100

    return result
if __name__ == "__main__":

    df = load_sales_data()

    kpis = calculate_kpis(df)

    print("\n===== BUSINESS KPIs =====")

    print(f"Total Revenue: €{kpis['total_revenue']:,.2f}")
    print(f"Total Cost: €{kpis['total_cost']:,.2f}")
    print(f"Total Profit: €{kpis['total_profit']:,.2f}")
    print(f"Profit Margin: {kpis['profit_margin']:.2f}%")
    print(f"Total Units: {kpis['total_units']}")
    print(f"Average Sale: €{kpis['average_sale']:,.2f}")
    print("\n===== SALES BY PRODUCT =====")

    print(sales_by_product(df))


    print("\n===== SALES BY REGION =====")

    print(sales_by_region(df))
    print("\n===== MONTHLY SALES =====")

    print(monthly_sales(df))
    print("\n===== BUSINESS INSIGHTS =====")

    insights = generate_insights(df)

    for insight in insights:
        print(insight)
def sales_trend(data):
    if len(data) < 2:
        return {
            "trend": "insufficient_data",
            "change_percent": 0,
            "message": "Not enough data to calculate a trend."
        }

    data = data.sort_values("date")

    first_sales = data.iloc[0]["sales"]
    last_sales = data.iloc[-1]["sales"]

    if first_sales == 0:
        return {
            "trend": "undefined",
            "change_percent": 0,
            "message": "Cannot calculate the percentage change because the first sales value is zero."
        }

    change_percent = (
        (last_sales - first_sales)
        / first_sales
    ) * 100

    if change_percent > 0:
        trend = "increasing"
        message = (
            f"Sales increased by {change_percent:.2f}% "
            f"from the first to the last recorded period."
        )

    elif change_percent < 0:
        trend = "decreasing"
        message = (
            f"Sales decreased by {abs(change_percent):.2f}% "
            f"from the first to the last recorded period."
        )

    else:
        trend = "stable"
        message = "Sales remained stable."

    return {
        "trend": trend,
        "change_percent": float(change_percent),
        "message": message
    }
def monthly_trend(data):
    if data.empty:
        return []

    monthly = data.groupby(
        data["date"].dt.to_period("M")
    ).agg(
        revenue=("sales", "sum"),
        cost=("cost", "sum"),
        units=("units", "sum")
    ).reset_index()

    monthly["date"] = monthly["date"].astype(str)

    monthly["profit"] = (
        monthly["revenue"] - monthly["cost"]
    )

    monthly["growth_percent"] = (
        monthly["revenue"].pct_change() * 100
    )

    monthly["growth_percent"] = (
        monthly["growth_percent"].fillna(0)
    )

    result = []

    for _, row in monthly.iterrows():

        result.append({
            "date": row["date"],
            "revenue": float(row["revenue"]),
            "cost": float(row["cost"]),
            "profit": float(row["profit"]),
            "units": int(row["units"]),
            "growth_percent": float(row["growth_percent"])
        })

    return result
def detect_anomalies(data, threshold=50):
    monthly = monthly_trend(data)

    anomalies = []

    for month in monthly:
        growth = month["growth_percent"]

        if abs(growth) > threshold:
            anomalies.append({
                "date": month["date"],
                "revenue": month["revenue"],
                "growth_percent": growth,
                "type": "increase" if growth > 0 else "decrease",
                "message": (
                    f"Revenue changed by {growth:.2f}% "
                    f"in {month['date']}."
                )
            })

    return anomalies
def explain_anomaly(data, anomaly_date):
    data = data.copy()

    data["month"] = data["date"].dt.to_period("M").astype(str)

    current_month = data[
        data["month"] == anomaly_date
    ]

    previous_months = data[
        data["month"] < anomaly_date
    ]

    if current_month.empty or previous_months.empty:
        return {
            "date": anomaly_date,
            "message": "Not enough data to explain this anomaly."
        }

    previous_month = (
        previous_months
        .groupby("month")["sales"]
        .sum()
        .iloc[-1]
    )

    current_product = (
        current_month
        .groupby("product")["sales"]
        .sum()
        .sort_values(ascending=False)
    )

    current_region = (
        current_month
        .groupby("region")["sales"]
        .sum()
        .sort_values(ascending=False)
    )

    top_product = current_product.index[0]
    top_product_revenue = current_product.iloc[0]

    top_region = current_region.index[0]
    top_region_revenue = current_region.iloc[0]

    current_revenue = current_month["sales"].sum()

    growth_percent = (
        (current_revenue - previous_month)
        / previous_month
    ) * 100

    return {
        "date": anomaly_date,
        "current_revenue": float(current_revenue),
        "previous_revenue": float(previous_month),
        "growth_percent": float(growth_percent),
        "top_product": top_product,
        "top_product_revenue": float(top_product_revenue),
        "top_region": top_region,
        "top_region_revenue": float(top_region_revenue),
        "message": (
            f"Revenue changed by {growth_percent:.2f}%. "
            f"{top_product} was the largest product contributor "
            f"with €{top_product_revenue:,.2f}, while "
            f"{top_region} was the largest regional contributor "
            f"with €{top_region_revenue:,.2f}."
        )
    }
def compare_periods(
    data,
    period1_from,
    period1_to,
    period2_from,
    period2_to
):
    period1 = data[
        (data["date"] >= period1_from) &
        (data["date"] <= period1_to)
    ]

    period2 = data[
        (data["date"] >= period2_from) &
        (data["date"] <= period2_to)
    ]

    def calculate_period_metrics(period):
        revenue = period["sales"].sum()
        cost = period["cost"].sum()
        profit = revenue - cost
        units = period["units"].sum()

        return {
            "revenue": float(revenue),
            "cost": float(cost),
            "profit": float(profit),
            "units": int(units)
        }

    metrics1 = calculate_period_metrics(period1)
    metrics2 = calculate_period_metrics(period2)

    def calculate_change(value1, value2):
        if value1 == 0:
            return 0

        return ((value2 - value1) / value1) * 100

    return {
        "period1": {
            "from": period1_from,
            "to": period1_to,
            "metrics": metrics1
        },
        "period2": {
            "from": period2_from,
            "to": period2_to,
            "metrics": metrics2
        },
        "changes": {
            "revenue_percent": float(
                calculate_change(
                    metrics1["revenue"],
                    metrics2["revenue"]
                )
            ),
            "cost_percent": float(
                calculate_change(
                    metrics1["cost"],
                    metrics2["cost"]
                )
            ),
            "profit_percent": float(
                calculate_change(
                    metrics1["profit"],
                    metrics2["profit"]
                )
            ),
            "units_percent": float(
                calculate_change(
                    metrics1["units"],
                    metrics2["units"]
                )
            )
        }
    }