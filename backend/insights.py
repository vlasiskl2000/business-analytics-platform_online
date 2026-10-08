def generate_insights(data):

    insights = []

    # Best product by revenue
    product_revenue = data.groupby("product")["sales"].sum()

    best_product = product_revenue.idxmax()
    best_product_revenue = product_revenue.max()

    insights.append(
        f"🏆 {best_product} generated the highest revenue "
        f"with €{best_product_revenue:,.2f}."
    )

    # Best product by margin
    product_profit = data.groupby("product").agg(
        revenue=("sales", "sum"),
        cost=("cost", "sum")
    )

    product_profit["profit"] = (
        product_profit["revenue"] - product_profit["cost"]
    )

    product_profit["margin"] = (
        product_profit["profit"] /
        product_profit["revenue"]
    ) * 100

    best_margin_product = product_profit["margin"].idxmax()
    best_margin = product_profit["margin"].max()

    insights.append(
        f"💰 {best_margin_product} has the highest profit margin "
        f"at {best_margin:.2f}%."
    )

    # Best region by revenue
    region_revenue = data.groupby("region")["sales"].sum()

    best_region = region_revenue.idxmax()
    best_region_revenue = region_revenue.max()

    insights.append(
        f"🌍 {best_region} generated the highest revenue "
        f"with €{best_region_revenue:,.2f}."
    )

    # Best region by margin
    region_profit = data.groupby("region").agg(
        revenue=("sales", "sum"),
        cost=("cost", "sum")
    )

    region_profit["profit"] = (
        region_profit["revenue"] - region_profit["cost"]
    )

    region_profit["margin"] = (
        region_profit["profit"] /
        region_profit["revenue"]
    ) * 100

    best_margin_region = region_profit["margin"].idxmax()
    best_region_margin = region_profit["margin"].max()

    insights.append(
        f"📊 {best_margin_region} has the highest regional margin "
        f"at {best_region_margin:.2f}%."
    )

    # Lowest margin product
    worst_margin_product = product_profit["margin"].idxmin()
    worst_margin = product_profit["margin"].min()

    insights.append(
        f"⚠️ {worst_margin_product} has the lowest product margin "
        f"at {worst_margin:.2f}%."
    )

    return insights