
function getAuthHeaders() {

    const token =
        localStorage.getItem("access_token");

    return {
        "Authorization": `Bearer ${token}`
    };
}
async function loadCurrentUser() {

    const token = localStorage.getItem("access_token");

    if (!token) {
        return;
    }

    try {

        const response = await fetch(
            `${API_URL}/api/me`,
            {
                headers: {
                    "Authorization": `Bearer ${token}`
                }
            }
        );
        console.log("ME status:", response.status);
        if (!response.ok) {
            return;
        }

        const data = await response.json();
        console.log("Current user:", data) ; 
        const adminLink =
            document.getElementById("adminNavLink");

        if (
            adminLink &&
            data.role === "admin"
        ) {
            adminLink.style.display = "inline-block";
        }

    } catch (error) {

        console.error(
            "Failed to load current user:",
            error
        );
    }
}

loadCurrentUser();
console.log("loadCurrentUser called");
function handleUnauthorized(response) {

    if (response.status === 401) {

        localStorage.removeItem("access_token");

        document.getElementById(
            "dashboard"
        ).style.display = "none";

        document.getElementById(
            "authScreen"
        ).style.display = "flex";

        document.getElementById(
            "authMessage"
        ).textContent =
            "Your session has expired. Please login again.";

        return true;
    }

    return false;
}
let productChart = null;
let regionChart = null;
let monthlyChart = null;
let datasetRows = [];
let datasetColumns = [];
let currentPage = 1;
let rowsPerPage = 5;
let filteredDatasetRows = [];
let sortColumn = null;
let sortDirection = "asc";
async function loadMetadata() {

    const response = await fetch(
        `${API_URL}/api/metadata`
    );

    const data = await response.json();

    const productFilter = document.getElementById("productFilter");
    const regionFilter = document.getElementById("regionFilter");

    // Clear existing options
    productFilter.innerHTML = "";
    regionFilter.innerHTML = "";

    // All Products option
    const allProducts = document.createElement("option");
    allProducts.value = "";
    allProducts.textContent = "All Products";
    productFilter.appendChild(allProducts);

    // Products from dataset
    data.products.forEach(product => {

        const option = document.createElement("option");

        option.value = product;
        option.textContent = product;

        productFilter.appendChild(option);
    });

    // All Regions option
    const allRegions = document.createElement("option");
    allRegions.value = "";
    allRegions.textContent = "All Regions";
    regionFilter.appendChild(allRegions);

    // Regions from dataset
    data.regions.forEach(region => {

        const option = document.createElement("option");

        option.value = region;
        option.textContent = region;

        regionFilter.appendChild(option);
    });
    const dateFrom = document.getElementById("dateFrom");
const dateTo = document.getElementById("dateTo");

dateFrom.min = data.date_min;
dateFrom.max = data.date_max;

dateTo.min = data.date_min;
dateTo.max = data.date_max;
dateFrom.value = data.date_min;
dateTo.value = data.date_max;
}
function getFilterParams() {
    const params = new URLSearchParams();

    const product = document.getElementById("productFilter").value;
    const region = document.getElementById("regionFilter").value;
    const dateFrom = document.getElementById("dateFrom").value;
    const dateTo = document.getElementById("dateTo").value;

    if (product) {
        params.append("product", product);
    }

    if (region) {
        params.append("region", region);
    }

    if (dateFrom) {
        params.append("date_from", dateFrom);
    }

    if (dateTo) {
        params.append("date_to", dateTo);
    }

    return params.toString();
}

// ==============================
// LOAD KPIs
// ==============================

// ==============================
// LOAD KPIs
// ==============================

async function loadKPIs() {

    const params = getFilterParams();

    const response = await fetch(
        `${API_URL}/api/kpis?${params}`
    );

    const data = await response.json();

    document.getElementById("revenue").textContent =
        `€${data.total_revenue.toLocaleString("en-US", {
            minimumFractionDigits: 2
        })}`;

    document.getElementById("cost").textContent =
        `€${data.total_cost.toLocaleString()}`;

    document.getElementById("profit").textContent =
        `€${data.total_profit.toLocaleString("en-US", {
            minimumFractionDigits: 2
        })}`;

    document.getElementById("margin").textContent =
        `${data.profit_margin.toFixed(2)}%`;

    document.getElementById("units").textContent =
        data.total_units.toLocaleString("en-US");


    // ==============================
    // PROFIT MARGIN GAUGE
    // ==============================

    const marginValue = data.profit_margin;

    const gauge = document.getElementById("marginGauge");

    if (gauge && !isNaN(marginValue)) {

        const circumference = 314;

        const percentage = Math.min(
            Math.max(marginValue, 0),
            100
        );

        const offset =
            circumference -
            (percentage / 100) * circumference;

        gauge.style.strokeDashoffset = offset;

        if (percentage >= 50) {
            gauge.style.stroke = "#16a34a";
        } else if (percentage >= 30) {
            gauge.style.stroke = "#2563eb";
        } else {
            gauge.style.stroke = "#f59e0b";
        }
    }
}

// ==============================
// LOAD PRODUCTS
// ==============================

async function loadProducts() {
    const params = getFilterParams();

const response = await fetch(
    `${API_URL}/api/products?${params}`
);
    const products = await response.json();

    const labels = products.map(product => product.product);
    const revenue = products.map(product => product.revenue);

    const ctx = document.getElementById("productChart");
if (productChart) {
    productChart.destroy();
}
    productChart = new Chart(ctx, {
        type: "bar",

        data: {
            labels: labels,

            datasets: [{
                label: "Revenue (€)",
                data: revenue
            }]
        },

        options: {
            responsive: true,

            plugins: {
                legend: {
                    display: true
                }
            },

            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}


// ==============================
// LOAD REGIONS
// ==============================

async function loadRegions() {
    const params = getFilterParams();

const response = await fetch(
    `${API_URL}/api/regions?${params}`
);
    const regions = await response.json();

    const labels = regions.map(region => region.region);
    const revenue = regions.map(region => region.revenue);

    const ctx = document.getElementById("regionChart");
if (regionChart) {
    regionChart.destroy();
}
    regionChart = new Chart(ctx, {
        type: "bar",

        data: {
            labels: labels,

            datasets: [{
                label: "Revenue (€)",
                data: revenue
            }]
        },

        options: {
            responsive: true,

            plugins: {
                legend: {
                    display: true
                }
            },

            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}


// ==============================
// LOAD MONTHLY DATA
// ==============================

async function loadMonthly() {
    const params = getFilterParams();

    const response = await fetch(
        `${API_URL}/api/monthly-trend?${params}`
    );

    const monthly = await response.json();

    const labels = monthly.map(month => month.date);
    const revenue = monthly.map(month => month.revenue);
    const profit = monthly.map(month => month.profit);
    const growthIndicator =
      document.getElementById("growthIndicator");

    if (monthly.length > 0) {
       const latestGrowth =
          monthly[monthly.length - 1].growth_percent;

        growthIndicator.textContent =
         `Latest Growth: ${latestGrowth.toFixed(2)}%`;
    } else {
    growthIndicator.textContent =
        "Latest Growth: -";
    }
    const ctx = document.getElementById("monthlyChart");

    if (monthlyChart) {
        monthlyChart.destroy();
    }

    monthlyChart = new Chart(ctx, {
        type: "line",

        data: {
            labels: labels,

            datasets: [
                {
                    label: "Revenue (€)",
                    data: revenue,
                    tension: 0.3
                },
                {
                    label: "Profit (€)",
                    data: profit,
                    tension: 0.3
                }
            ]
        },

        options: {
            responsive: true,

            interaction: {
                intersect: false,
                mode: "index"
            },

            plugins: {
                legend: {
                    display: true
                },

                tooltip: {
                    callbacks: {
                        afterBody: function(context) {
                            const index = context[0].dataIndex;

                            const growth =
                                monthly[index].growth_percent;

                            return `Growth: ${growth.toFixed(2)}%`;
                        }
                    }
                }
            },

            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}

// ==============================
// LOAD BUSINESS INSIGHTS
// ==============================

async function loadInsights() {

   const params = getFilterParams();

const response = await fetch(
    `${API_URL}/api/insights?${params}`
);

    const data = await response.json();

    const container = document.getElementById("insights");

    container.innerHTML = "";

    data.insights.forEach(insight => {

        const element = document.createElement("div");

        element.className = "insight";

        element.textContent = insight;

        container.appendChild(element);

    });
}
async function loadAnomalies() {
    const params = getFilterParams();

    const response = await fetch(
        `${API_URL}/api/anomalies?${params}`
    );

    const anomalies = await response.json();

    const container =
        document.getElementById("anomalyAlerts");

    container.innerHTML = "";

    if (anomalies.length === 0) {
        container.innerHTML =
            "<p>No anomalies detected.</p>";
        return;
    }

    anomalies.forEach(anomaly => {
        const alert = document.createElement("div");

        alert.classList.add("anomaly-alert");

        const direction =
            anomaly.type === "increase"
                ? "📈"
                : "📉";

        alert.innerHTML = `
            <div class="anomaly-title">
                ${direction} ${anomaly.date}
            </div>

            <div class="anomaly-message">
                ${anomaly.message}
            </div>

            <div class="anomaly-growth">
                Growth: ${anomaly.growth_percent.toFixed(2)}%
            </div>

            <button
                class="explain-button"
                onclick="explainAnomaly('${anomaly.date}')"
            >
                🔍 Explain
            </button>

            <div
                id="explanation-${anomaly.date}"
                class="anomaly-explanation"
            ></div>
        `;

        container.appendChild(alert);
    });
}
async function explainAnomaly(anomalyDate) {
    const explanationContainer =
        document.getElementById(
            `explanation-${anomalyDate}`
        );

    explanationContainer.innerHTML =
        "<p>Analyzing anomaly...</p>";

    try {
        const response = await fetch(
            `${API_URL}/api/anomalies/${anomalyDate}`
        );

        const explanation = await response.json();

        if (explanation.message &&
            !explanation.current_revenue) {

            explanationContainer.innerHTML = `
                <p>${explanation.message}</p>
            `;

            return;
        }

        explanationContainer.innerHTML = `
            <div class="explanation-content">

                <h4>🔍 Explanation</h4>

                <p>
                    ${explanation.message}
                </p>

                <div class="explanation-grid">

                    <div>
                        <span>Previous Revenue</span>
                        <strong>
                            €${explanation.previous_revenue.toLocaleString(
                                "en-US",
                                {
                                    minimumFractionDigits: 2
                                }
                            )}
                        </strong>
                    </div>

                    <div>
                        <span>Current Revenue</span>
                        <strong>
                            €${explanation.current_revenue.toLocaleString(
                                "en-US",
                                {
                                    minimumFractionDigits: 2
                                }
                            )}
                        </strong>
                    </div>

                    <div>
                        <span>Top Product</span>
                        <strong>
                            ${explanation.top_product}
                        </strong>
                    </div>

                    <div>
                        <span>Product Revenue</span>
                        <strong>
                            €${explanation.top_product_revenue.toLocaleString(
                                "en-US",
                                {
                                    minimumFractionDigits: 2
                                }
                            )}
                        </strong>
                    </div>

                    <div>
                        <span>Top Region</span>
                        <strong>
                            ${explanation.top_region}
                        </strong>
                    </div>

                    <div>
                        <span>Regional Revenue</span>
                        <strong>
                            €${explanation.top_region_revenue.toLocaleString(
                                "en-US",
                                {
                                    minimumFractionDigits: 2
                                }
                            )}
                        </strong>
                    </div>

                </div>

            </div>
        `;

    } catch (error) {
        console.error(
            "Anomaly explanation error:",
            error
        );

        explanationContainer.innerHTML =
            "<p>Unable to explain this anomaly.</p>";
    }
}
async function loadDatasetPreview() {
    const params = getFilterParams();

    const response = await fetch(`${API_URL}/api/data?${params}`);
    const data = await response.json();

    datasetRows = data.rows;
    datasetColumns = data.columns;

    document.getElementById("datasetRows").textContent =
        `Rows: ${data.total_rows}`;

    document.getElementById("datasetColumns").textContent =
        `Columns: ${data.columns.length}`;

    filteredDatasetRows = datasetRows;
    currentPage = 1;

    renderDatasetTable();
}
async function loadDatasets() {

    try {

        const response = await fetch(
    `${API_URL}/api/datasets`,
    {
        headers: getAuthHeaders()
    }
);
        if (handleUnauthorized(response)) {
         return;
        }
        const result = await response.json();

        const container =
            document.getElementById("datasetManager");

        if (!result.datasets || result.datasets.length === 0) {

            container.innerHTML = `
                <p>No datasets uploaded yet.</p>
            `;

            return;
        }

        container.innerHTML = result.datasets.map(dataset => `

            <div>
    <strong>${dataset.name}</strong>

    <p>
        ${dataset.rows} rows
        • Uploaded:
        ${new Date(
            dataset.uploaded_at
        ).toLocaleString()}
    </p>

    ${
        dataset.is_active
            ? `<span class="active-dataset">🟢 ACTIVE</span>`
            : `<span class="inactive-dataset">⚪ INACTIVE</span>`
    }
</div>

    <button
        onclick="loadDataset(${dataset.id})"
    >
        Load
    </button>

    <button
        onclick="deleteDataset(${dataset.id})"
    >
        Delete
    </button>

</div>

            </div>

        `).join("");

    } catch (error) {

        console.error(
            "Error loading datasets:",
            error
        );

        document.getElementById(
            "datasetManager"
        ).innerHTML = `
            <p>Could not load datasets.</p>
        `;
    }
}
async function loadDataset(datasetId) {

    try {

        const response = await fetch(
    `${API_URL}/api/datasets/${datasetId}/load`,
    {
        method: "POST",
        headers: getAuthHeaders()
    }
);
        if (handleUnauthorized(response)) {
             return;
        }
        const result = await response.json();

        if (!result.success) {

            alert(
                result.message ||
                "Could not load dataset."
            );

            return;
        }

        alert(
            "Dataset loaded successfully."
        );

        await loadDashboard();

    } catch (error) {

        console.error(
            "Error loading dataset:",
            error
        );

        alert(
            "Could not load dataset."
        );
    }
}
async function deleteDataset(datasetId) {

    const confirmed = confirm(
        "Are you sure you want to delete this dataset?"
    );

    if (!confirmed) {
        return;
    }

    try {

        const response = await fetch(
    `${API_URL}/api/datasets/${datasetId}`,
    {
        method: "DELETE",
        headers: getAuthHeaders()
    }
);

        const result = await response.json();

        if (!result.success) {

            alert(
                result.message ||
                "Could not delete dataset."
            );

            return;
        }

        alert(
            "Dataset deleted successfully."
        );

        await loadDatasets();

    } catch (error) {

        console.error(
            "Error deleting dataset:",
            error
        );

        alert(
            "Could not delete dataset."
        );
    }
}
function searchDataset() {
    const searchValue =
        document.getElementById("datasetSearch").value
        .toLowerCase();

    filteredDatasetRows = datasetRows.filter(row => {
        return datasetColumns.some(column => {
            const value = row[column];

            return String(value)
                .toLowerCase()
                .includes(searchValue);
        });
    });

    currentPage = 1;

    renderDatasetTable();
}
function sortDataset(column) {
    if (sortColumn === column) {
        sortDirection =
            sortDirection === "asc" ? "desc" : "asc";
    } else {
        sortColumn = column;
        sortDirection = "asc";
    }

    filteredDatasetRows.sort((a, b) => {
        let valueA = a[column];
        let valueB = b[column];

        if (!isNaN(valueA) && !isNaN(valueB)) {
            valueA = Number(valueA);
            valueB = Number(valueB);
        } else {
            valueA = String(valueA).toLowerCase();
            valueB = String(valueB).toLowerCase();
        }

        if (valueA < valueB) {
            return sortDirection === "asc" ? -1 : 1;
        }

        if (valueA > valueB) {
            return sortDirection === "asc" ? 1 : -1;
        }

        return 0;
    });

    currentPage = 1;

    renderDatasetTable();
}
function renderDatasetTable() {
    const tableHead = document.querySelector("#datasetTable thead");
    const tableBody = document.querySelector("#datasetTable tbody");

    tableHead.innerHTML = "";
    tableBody.innerHTML = "";

    const headerRow = document.createElement("tr");

    datasetColumns.forEach(column => {
    const th = document.createElement("th");

    let headerText = column;

    if (sortColumn === column) {
        headerText +=
            sortDirection === "asc" ? " ↑" : " ↓";
    }

    th.textContent = headerText;

    th.addEventListener("click", () => {
        sortDataset(column);
    });

    th.style.cursor = "pointer";

    headerRow.appendChild(th);
});
    tableHead.appendChild(headerRow);

    const startIndex = (currentPage - 1) * rowsPerPage;
    const endIndex = startIndex + rowsPerPage;

    const pageRows = filteredDatasetRows.slice(
        startIndex,
        endIndex
    );

    pageRows.forEach(row => {
        const tableRow = document.createElement("tr");

        datasetColumns.forEach(column => {
            const td = document.createElement("td");

            let value = row[column];

            if (value === null || value === undefined) {
                value = "";
            }

            td.textContent = value;

            tableRow.appendChild(td);
        });

        tableBody.appendChild(tableRow);
    });

    renderPagination();
}
function renderPagination() {
    const pagination = document.getElementById("pagination");

    pagination.innerHTML = "";

    const totalPages = Math.ceil(
        filteredDatasetRows.length / rowsPerPage
    );

    if (totalPages <= 1) {
        return;
    }

    const previousButton = document.createElement("button");

    previousButton.textContent = "← Previous";
    previousButton.disabled = currentPage === 1;

    previousButton.addEventListener("click", () => {
        if (currentPage > 1) {
            currentPage--;
            renderDatasetTable();
        }
    });

    pagination.appendChild(previousButton);

    for (let page = 1; page <= totalPages; page++) {
        const pageButton = document.createElement("button");

        pageButton.textContent = page;

        if (page === currentPage) {
            pageButton.classList.add("active");
        }

        pageButton.addEventListener("click", () => {
            currentPage = page;
            renderDatasetTable();
        });

        pagination.appendChild(pageButton);
    }

    const nextButton = document.createElement("button");

    nextButton.textContent = "Next →";
    nextButton.disabled = currentPage === totalPages;

    nextButton.addEventListener("click", () => {
        if (currentPage < totalPages) {
            currentPage++;
            renderDatasetTable();
        }
    });

    pagination.appendChild(nextButton);
}
// ==============================
// LOAD EVERYTHING
// ==============================
async function comparePeriods() {

    const period1From =
        document.getElementById("period1From").value;

    const period1To =
        document.getElementById("period1To").value;

    const period2From =
        document.getElementById("period2From").value;

    const period2To =
        document.getElementById("period2To").value;

    const results =
        document.getElementById("comparisonResults");


    if (
        !period1From ||
        !period1To ||
        !period2From ||
        !period2To
    ) {

        results.innerHTML =
            "<p>Please select both periods.</p>";

        return;
    }


    results.innerHTML =
        "<p>Comparing periods...</p>";


    try {

        const params = new URLSearchParams({

            period1_from: period1From,
            period1_to: period1To,

            period2_from: period2From,
            period2_to: period2To

        });


        const response = await fetch(
            `${API_URL}/api/compare?${params}`
        );


        if (!response.ok) {
            throw new Error("Comparison request failed");
        }


        const data = await response.json();


        results.innerHTML = `

            <div class="comparison-summary">

                <div class="comparison-period-result">

                    <h4>Period 1</h4>

                    <p>
                        ${data.period1.from}
                        →
                        ${data.period1.to}
                    </p>

                    <div class="comparison-metrics">

                        <div>
                            <span>Revenue</span>
                            <strong>
                                €${data.period1.metrics.revenue.toLocaleString()}
                            </strong>
                        </div>

                        <div>
                            <span>Cost</span>
                            <strong>
                                €${data.period1.metrics.cost.toLocaleString()}
                            </strong>
                        </div>

                        <div>
                            <span>Profit</span>
                            <strong>
                                €${data.period1.metrics.profit.toLocaleString()}
                            </strong>
                        </div>

                        <div>
                            <span>Units</span>
                            <strong>
                                ${data.period1.metrics.units.toLocaleString()}
                            </strong>
                        </div>

                    </div>

                </div>


                <div class="comparison-period-result">

                    <h4>Period 2</h4>

                    <p>
                        ${data.period2.from}
                        →
                        ${data.period2.to}
                    </p>

                    <div class="comparison-metrics">

                        <div>
                            <span>Revenue</span>
                            <strong>
                                €${data.period2.metrics.revenue.toLocaleString()}
                            </strong>
                        </div>

                        <div>
                            <span>Cost</span>
                            <strong>
                                €${data.period2.metrics.cost.toLocaleString()}
                            </strong>
                        </div>

                        <div>
                            <span>Profit</span>
                            <strong>
                                €${data.period2.metrics.profit.toLocaleString()}
                            </strong>
                        </div>

                        <div>
                            <span>Units</span>
                            <strong>
                                ${data.period2.metrics.units.toLocaleString()}
                            </strong>
                        </div>

                    </div>

                </div>

            </div>


            <div class="comparison-changes">

                <h4>📈 Changes</h4>

                <div class="change-grid">

                    <div>
                        <span>Revenue</span>
                        <strong>
                            ${data.changes.revenue_percent.toFixed(2)}%
                        </strong>
                    </div>

                    <div>
                        <span>Cost</span>
                        <strong>
                            ${data.changes.cost_percent.toFixed(2)}%
                        </strong>
                    </div>

                    <div>
                        <span>Profit</span>
                        <strong>
                            ${data.changes.profit_percent.toFixed(2)}%
                        </strong>
                    </div>

                    <div>
                        <span>Units</span>
                        <strong>
                            ${data.changes.units_percent.toFixed(2)}%
                        </strong>
                    </div>

                </div>

            </div>

        `;

    } catch (error) {

        console.error(
            "Comparison error:",
            error
        );

        results.innerHTML =
            "<p>Unable to compare the selected periods.</p>";
    }
}
let forecastChart = null;


async function loadForecast() {

    const periods =
        document.getElementById("forecastPeriods").value;

    const response = await fetch(
        `${API_URL}/api/forecast?periods=${periods}`
    );

    if (!response.ok) {
        throw new Error("Forecast request failed");
    }

    const data = await response.json();
// Forecast model information

document.getElementById(
    "forecastModelType"
).textContent =
    data.model.type;

document.getElementById(
    "forecastAnomalyAdjustment"
).textContent =
    data.model.anomaly_adjustment
        ? "Enabled"
        : "Disabled";

document.getElementById(
    "forecastAnomalyThreshold"
).textContent =
    `${data.model.threshold}%`;

document.getElementById(
    "forecastMAE"
).textContent =
    `€${data.evaluation.mae.toLocaleString(
        "en-US",
        {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }
    )}`;

document.getElementById(
    "forecastRMSE"
).textContent =
    `€${data.evaluation.rmse.toLocaleString(
        "en-US",
        {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }
    )}`;

document.getElementById(
    "forecastMAPE"
).textContent =
    `${data.evaluation.mape.toFixed(2)}%`;

    // -------------------------
    // Historical data
    // -------------------------

    const historicalLabels =
        data.historical.map(item => item.date);

    const historicalRevenue =
        data.historical.map(item => item.revenue);


    // -------------------------
    // Forecast data
    // -------------------------

    const forecastLabels =
        data.forecast.map(item => item.date);

    const forecastRevenue =
        data.forecast.map(item => item.revenue);

    const lowerBound =
        data.forecast.map(item => item.lower_bound);

    const upperBound =
        data.forecast.map(item => item.upper_bound);


    // -------------------------
    // Summary metrics
    // -------------------------

    const lastActual =
        historicalRevenue[
            historicalRevenue.length - 1
        ];

    const nextForecast =
        forecastRevenue[0];


    const forecastGrowth =
        ((nextForecast - lastActual)
        / lastActual) * 100;


    document.getElementById(
        "lastActualRevenue"
    ).textContent =
        `€${lastActual.toLocaleString(
            "en-US",
            {
                minimumFractionDigits: 2
            }
        )}`;


    document.getElementById(
        "nextForecastRevenue"
    ).textContent =
        `€${nextForecast.toLocaleString(
            "en-US",
            {
                minimumFractionDigits: 2
            }
        )}`;


    document.getElementById(
        "forecastGrowth"
    ).textContent =
        `${forecastGrowth.toFixed(2)}%`;


    // -------------------------
    // Chart data
    // -------------------------

    const labels = [
        ...historicalLabels,
        ...forecastLabels
    ];


    const actualData = [
        ...historicalRevenue,
        ...forecastLabels.map(() => null)
    ];


    const forecastData = [
        ...historicalLabels.map(() => null),
        ...forecastRevenue
    ];


    const lowerData = [
        ...historicalLabels.map(() => null),
        ...lowerBound
    ];


    const upperData = [
        ...historicalLabels.map(() => null),
        ...upperBound
    ];


    const ctx =
        document.getElementById(
            "forecastChart"
        );


    if (forecastChart) {
        forecastChart.destroy();
    }


    forecastChart = new Chart(ctx, {

        type: "line",

        data: {

            labels: labels,

            datasets: [

                {
                    label: "Actual Revenue",

                    data: actualData,

                    tension: 0.3
                },

                {
                    label: "Forecast Revenue",

                    data: forecastData,

                    borderDash: [6, 6],

                    tension: 0.3
                },

                {
                    label: "Lower Bound",

                    data: lowerData,

                    borderDash: [3, 3],

                    tension: 0.3
                },

                {
                    label: "Upper Bound",

                    data: upperData,

                    borderDash: [3, 3],

                    tension: 0.3
                }

            ]

        },

        options: {

            responsive: true,

            interaction: {
                intersect: false,
                mode: "index"
            },

            plugins: {

                legend: {
                    display: true
                },

                tooltip: {

                    callbacks: {

                        label: function(context) {

                            return (
                                context.dataset.label +
                                ": €" +
                                context.parsed.y.toLocaleString(
                                    "en-US",
                                    {
                                        minimumFractionDigits: 2
                                    }
                                )
                            );

                        }

                    }

                }

            },

            scales: {

                y: {
                    beginAtZero: true
                }

            }

        }

    });

}
async function loadDashboard() {

    await loadMetadata();
    await loadKPIs();
    await loadProducts();
    await loadRegions();
    await loadMonthly();
    await loadInsights();
    await loadAnomalies();
    await loadDatasetPreview();
    await loadDatasets();
    await loadForecast();
}


loadDashboard();
document.getElementById("applyFilters").addEventListener("click", () => {
    loadDashboard();
});
document.getElementById("datasetSearch").addEventListener(
    "input",
    searchDataset
);
document.getElementById("rowsPerPage").addEventListener(
    "change",
    (event) => {
        rowsPerPage = Number(event.target.value);
        currentPage = 1;

        renderDatasetTable();
    }
);
document.getElementById("comparePeriods").addEventListener(
    "click",
    comparePeriods
);
document.getElementById(
    "generateForecast"
).addEventListener(
    "click",
    loadForecast
);
document.getElementById("uploadButton").addEventListener("click", async () => {

    const fileInput = document.getElementById("csvFile");
    const status = document.getElementById("uploadStatus");

    if (!fileInput.files.length) {
        status.textContent = "Please select a CSV file.";
        return;
    }

    const file = fileInput.files[0];

    const formData = new FormData();
    formData.append("file", file);

    status.textContent = "Uploading...";

    try {

        const response = await fetch(
    `${API_URL}/api/upload`,
    {
        method: "POST",
        headers: getAuthHeaders(),
        body: formData
    }
    );
        if (handleUnauthorized(response)) {
          return;
        }
        const result = await response.json();

        if (!result.success) {
            status.textContent = result.message;
            return;
        }

        status.textContent =
            `Uploaded ${result.filename} (${result.rows} rows)`;

        await loadDashboard();

    } catch (error) {

        console.error(error);

        status.textContent =
            "Upload failed.";
    }
});
document.getElementById("resetButton").addEventListener("click", async () => {

    const status = document.getElementById("uploadStatus");

    try {

        const response = await fetch(
            `${API_URL}/api/reset`,
            {
                method: "POST"
            }
        );

        const result = await response.json();

        if (result.success) {

            status.textContent = "Dataset reset successfully.";

            await loadDashboard();
        }

    } catch (error) {

        console.error(error);

        status.textContent = "Reset failed.";
    }
});
document.getElementById(
    "askBusinessQuestion"
).addEventListener(
    "click",
    askBusinessQuestion
);


async function askBusinessQuestion() {

    const input =
        document.getElementById(
            "businessQuestion"
        );

    const answerBox =
        document.getElementById(
            "businessAnswer"
        );

    const question =
        input.value.trim();

    if (!question) {

        answerBox.innerHTML = `
            <p>Please enter a question.</p>
        `;

        return;
    }

    answerBox.innerHTML = `
        <p>Analyzing your business data...</p>
    `;

    try {

        const response = await fetch(
            `${API_URL}/api/business-question?question=${encodeURIComponent(question)}`,
            {
                method: "POST"
            }
        );

        const result = await response.json();

        if (!response.ok) {

            throw new Error(
                result.detail ||
                "Could not analyze question."
            );
        }

        answerBox.innerHTML = `
            <p>
                ${result.answer}
            </p>
        `;

    } catch (error) {

        console.error(
            "Business Analyst error:",
            error
        );

        answerBox.innerHTML = `
            <p>
                Could not analyze the question.
            </p>
        `;
    }
}
// =========================
// Authentication
// =========================

document
    .getElementById("loginButton")
    .addEventListener("click", login);
document
    .getElementById("showRegister")
    .addEventListener("click", showRegister);

function showRegister() {
    document.getElementById(
        "authScreen"
    ).querySelector(".auth-card").style.display = "none";

    document.getElementById(
        "registerCard"
    ).style.display = "block";
}
document
    .getElementById("showLogin")
    .addEventListener("click", showLogin);

function showLogin() {
    document.getElementById(
        "registerCard"
    ).style.display = "none";

    document.getElementById(
        "authScreen"
    ).querySelector(".auth-card").style.display = "block";
}
document
    .getElementById("registerButton")
    .addEventListener("click", register);

async function register() {
    const username =
        document.getElementById("registerUsername").value.trim();

    const password =
        document.getElementById("registerPassword").value;

    const confirmPassword =
        document.getElementById("registerConfirmPassword").value;

    const message =
        document.getElementById("registerMessage");

    if (!username || !password || !confirmPassword) {
        message.textContent =
            "Please fill in all fields.";
        return;
    }

    if (password !== confirmPassword) {
        message.textContent =
            "Passwords do not match.";
        return;
    }

    message.textContent = "Creating account...";

    try {
        const response = await fetch(
            `${API_URL}/api/register?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`,
            {
                method: "POST"
            }
        );

        const result = await response.json();

        if (!result.success) {
            message.textContent =
                result.message || "Registration failed.";
            return;
        }

        document.getElementById(
    "registerUsername"
).value = "";

document.getElementById(
    "registerPassword"
).value = "";

document.getElementById(
    "registerConfirmPassword"
).value = "";

showLogin();

document.getElementById(
    "authMessage"
).textContent =
    "Account created successfully. Please login.";

        document.getElementById(
            "registerPassword"
        ).value = "";

        document.getElementById(
            "registerConfirmPassword"
        ).value = "";

    } catch (error) {
        console.error(
            "Registration error:",
            error
        );

        message.textContent =
            "Could not connect to the server.";
    }
}
async function login() {

    const username =
        document.getElementById("loginUsername").value.trim();

    const password =
        document.getElementById("loginPassword").value;

    const message =
        document.getElementById("authMessage");

    if (!username || !password) {

        message.textContent =
            "Please enter username and password.";

        return;
    }

    message.textContent = "Logging in...";

    try {

        const response = await fetch(
            `${API_URL}/api/login?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`,
            {
                method: "POST"
            }
        );

        const result = await response.json();

        if (!result.success) {

            message.textContent =
                result.message || "Login failed.";

            return;
        }

        // Save JWT
        localStorage.setItem(
            "access_token",
            result.access_token
        );

        message.textContent =
            "Login successful.";

        // Hide login screen
        document.getElementById(
            "authScreen"
        ).style.display = "none";

        // Show dashboard
        document.getElementById(
            "dashboard"
        ).style.display = "block";

        // Load dashboard
        await loadDashboard();

    } catch (error) {

        console.error(
            "Login error:",
            error
        );

        message.textContent =
            "Could not connect to the server.";
    }
}
// =========================
// Logout
// =========================

document
    .getElementById("logoutButton")
    .addEventListener("click", logout);

function logout() {

    localStorage.removeItem("access_token");

    document.getElementById(
        "dashboard"
    ).style.display = "none";

    document.getElementById(
        "authScreen"
    ).style.display = "flex";

    document.getElementById(
        "loginUsername"
    ).value = "";

    document.getElementById(
        "loginPassword"
    ).value = "";

    document.getElementById(
        "authMessage"
    ).textContent = "";
}
// =========================
// Check existing login
// =========================

window.addEventListener("DOMContentLoaded", async () => {

    const token =
        localStorage.getItem("access_token");

    if (!token) {
        return;
    }

    document.getElementById(
        "authScreen"
    ).style.display = "none";

    document.getElementById(
        "dashboard"
    ).style.display = "block";

    await loadDashboard();
});
