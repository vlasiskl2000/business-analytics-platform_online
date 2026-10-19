
const API_URL = (window.location.protocol === "file:")
    ? "http://127.0.0.1:8000"
    : "";


const nativeFetch = window.fetch.bind(window);
window.fetch = (input, init = {}) => {
    const url = typeof input === "string" ? input : input.url;
    if (url && url.startsWith(API_URL)) {
        init = {...init, headers: {...(init.headers || {}), ...getAuthHeaders()}};
    }
    return nativeFetch(input, init);
};


// Publish data for the 3D charts (charts3d.js). The last payload is kept in
// window.__ba so a chart that finishes loading later can still pick it up.
function emit3d(name, detail) {
    (window.__ba = window.__ba || {})[name] = detail;
    window.dispatchEvent(new CustomEvent(name, {detail}));
}

function getAuthHeaders() {
    const token = localStorage.getItem("access_token");
    return token ? { "Authorization": `Bearer ${token}` } : {};
}

function requireAuth() {
    const token = localStorage.getItem("access_token");
    if (!token) {
        window.location.href = "index.html";
        return false;
    }
    return true;
}

function handleUnauthorized(response) {
    if (response.status === 401) {
        localStorage.removeItem("access_token");
        window.location.href = "index.html";
        return true;
    }
    return false;
}

function getFilterParams() {
    const params = new URLSearchParams();
    const product = document.getElementById("productFilter");
    const region = document.getElementById("regionFilter");
    const dateFrom = document.getElementById("dateFrom");
    const dateTo = document.getElementById("dateTo");

    if (product?.value) params.append("product", product.value);
    if (region?.value) params.append("region", region.value);
    if (dateFrom?.value) params.append("date_from", dateFrom.value);
    if (dateTo?.value) params.append("date_to", dateTo.value);
    return params.toString();
}

async function loadMetadata() {
    const response = await fetch(`${API_URL}/api/metadata`);
    const data = await response.json();

    const productFilter = document.getElementById("productFilter");
    const regionFilter = document.getElementById("regionFilter");
    if (!productFilter || !regionFilter) return;

    productFilter.innerHTML = '<option value="">All Products</option>';
    data.products.forEach(product => {
        const option = document.createElement("option");
        option.value = product;
        option.textContent = product;
        productFilter.appendChild(option);
    });

    regionFilter.innerHTML = '<option value="">All Regions</option>';
    data.regions.forEach(region => {
        const option = document.createElement("option");
        option.value = region;
        option.textContent = region;
        regionFilter.appendChild(option);
    });

    const dateFrom = document.getElementById("dateFrom");
    const dateTo = document.getElementById("dateTo");
    if (dateFrom && dateTo) {
        dateFrom.min = data.date_min;
        dateFrom.max = data.date_max;
        dateTo.min = data.date_min;
        dateTo.max = data.date_max;
        dateFrom.value = data.date_min;
        dateTo.value = data.date_max;
    }
}

let productChart = null;
let regionChart = null;
let monthlyChart = null;
let forecastChart = null;
let scenarioChart = null;

async function loadKPIs() {
    const params = getFilterParams();
    const response = await fetch(`${API_URL}/api/kpis?${params}`);
    if (handleUnauthorized(response)) return;
    const data = await response.json();

    const set = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };

    set("revenue", `€${data.total_revenue.toLocaleString("en-US", {minimumFractionDigits: 2})}`);
    set("cost", `€${data.total_cost.toLocaleString("en-US", {minimumFractionDigits: 2})}`);
    set("profit", `€${data.total_profit.toLocaleString("en-US", {minimumFractionDigits: 2})}`);
    set("margin", `${data.profit_margin.toFixed(2)}%`);
    set("units", data.total_units.toLocaleString("en-US"));

    const gauge = document.getElementById("marginGauge");
    if (gauge) {
        const percentage = Math.min(Math.max(data.profit_margin, 0), 100);
        const circumference = 314;
        gauge.style.strokeDashoffset = circumference - (percentage / 100) * circumference;
        gauge.style.stroke = percentage >= 50 ? "#16a34a" : percentage >= 30 ? "#2563eb" : "#f59e0b";
    }
}

async function loadProducts() {
    const params = getFilterParams();
    const response = await fetch(`${API_URL}/api/products?${params}`);
    const products = await response.json();
    emit3d("ba:products", products);
    const canvas = document.getElementById("productChart");
    if (!canvas) return;
    if (productChart) productChart.destroy();

    productChart = new Chart(canvas, {
        type: "bar",
        data: {
            labels: products.map(x => x.product),
            datasets: [{label: "Revenue (€)", data: products.map(x => x.revenue)}]
        },
        options: {responsive:true, plugins:{legend:{display:true}}, scales:{y:{beginAtZero:true}}}
    });
}

async function loadRegions() {
    const params = getFilterParams();
    const response = await fetch(`${API_URL}/api/regions?${params}`);
    const regions = await response.json();
    emit3d("ba:regions", regions);
    const canvas = document.getElementById("regionChart");
    if (!canvas) return;
    if (regionChart) regionChart.destroy();

    regionChart = new Chart(canvas, {
        type: "bar",
        data: {
            labels: regions.map(x => x.region),
            datasets: [{label:"Revenue (€)", data:regions.map(x => x.revenue)}]
        },
        options:{responsive:true, plugins:{legend:{display:true}}, scales:{y:{beginAtZero:true}}}
    });
}

async function loadMonthly() {
    const params = getFilterParams();
    const response = await fetch(`${API_URL}/api/monthly-trend?${params}`);
    const monthly = await response.json();
    emit3d("ba:monthly", monthly);
    const canvas = document.getElementById("monthlyChart");
    const growthIndicator = document.getElementById("growthIndicator");

    if (growthIndicator) {
        const latestGrowth = monthly.length ? monthly[monthly.length - 1].growth_percent : null;
        growthIndicator.textContent = latestGrowth === null
            ? "Latest Growth: -"
            : `Latest Growth: ${Number(latestGrowth).toFixed(2)}%`;
    }

    if (!canvas) return;
    if (monthlyChart) monthlyChart.destroy();

    monthlyChart = new Chart(canvas, {
        type:"line",
        data:{
            labels:monthly.map(x => x.date),
            datasets:[
                {label:"Revenue (€)", data:monthly.map(x => x.revenue), tension:0.3},
                {label:"Profit (€)", data:monthly.map(x => x.profit), tension:0.3}
            ]
        },
        options:{
            responsive:true,
            interaction:{intersect:false,mode:"index"},
            plugins:{
                tooltip:{
                    callbacks:{
                        afterBody: function(context) {
                            const growth = monthly[context[0].dataIndex]?.growth_percent;
                            return growth === undefined ? "" : `Growth: ${Number(growth).toFixed(2)}%`;
                        }
                    }
                }
            },
            scales:{y:{beginAtZero:true}}
        }
    });
}

async function loadInsights() {
    const params = getFilterParams();
    const response = await fetch(`${API_URL}/api/insights?${params}`);
    const result = await response.json();
    const box = document.getElementById("insights");
    if (!box) return;
    box.innerHTML = "";
    (result.insights || []).forEach(text => {
        const p = document.createElement("p");
        p.textContent = text;
        box.appendChild(p);
    });
}

async function comparePeriods() {
    const p1f = document.getElementById("period1From")?.value;
    const p1t = document.getElementById("period1To")?.value;
    const p2f = document.getElementById("period2From")?.value;
    const p2t = document.getElementById("period2To")?.value;
    const box = document.getElementById("comparisonResults");

    if (!p1f || !p1t || !p2f || !p2t) {
        if (box) box.innerHTML = "<p>Please select both periods.</p>";
        return;
    }

    const params = new URLSearchParams({
        period1_from: p1f, period1_to: p1t,
        period2_from: p2f, period2_to: p2t
    });

    const response = await fetch(`${API_URL}/api/compare?${params}`);
    const result = await response.json();
    if (!box) return;

    const m1 = result.period1?.metrics || {};
    const m2 = result.period2?.metrics || {};
    const changes = result.changes || {};

    const metrics = [
        ["Revenue", m1.revenue, m2.revenue, changes.revenue, true],
        ["Cost", m1.cost, m2.cost, changes.cost, true],
        ["Profit", m1.profit, m2.profit, changes.profit, true],
        ["Units", m1.units, m2.units, changes.units, false]
    ];

    box.innerHTML = `
      <div class="comparison-grid">
        ${metrics.map(([name,a,b,c,currency]) => `
          <div class="comparison-metric">
            <span>${name}</span>
            <strong>${currency ? "€" : ""}${Number(a ?? 0).toLocaleString("en-US",{maximumFractionDigits:2})}</strong>
            <small>→ ${currency ? "€" : ""}${Number(b ?? 0).toLocaleString("en-US",{maximumFractionDigits:2})} (${Number(c ?? 0).toFixed(2)}%)</small>
          </div>`).join("")}
      </div>`;
}

async function loadForecast() {
    const periods = Number(document.getElementById("forecastPeriods")?.value || 3);
    const response = await fetch(`${API_URL}/api/forecast?periods=${periods}`);
    if (handleUnauthorized(response)) return;
    if (!response.ok) throw new Error("Forecast request failed");

    const data = await response.json();

    const set = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };

    set("forecastModelType", data.model?.type || "-");
    set("forecastAnomalyAdjustment", data.model?.anomaly_adjustment ? "Enabled" : "Disabled");
    set("forecastAnomalyThreshold", `${data.model?.threshold ?? "-"}%`);
    set("forecastMAE", `€${Number(data.evaluation?.mae ?? 0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}`);
    set("forecastRMSE", `€${Number(data.evaluation?.rmse ?? 0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}`);
    set("forecastMAPE", `${Number(data.evaluation?.mape ?? 0).toFixed(2)}%`);

    const historical = data.historical || [];
    const forecast = data.forecast || [];
    emit3d("ba:forecast", {historical, forecast});
    const lastActual = historical.length ? historical[historical.length - 1].revenue : 0;
    const nextForecast = forecast.length ? forecast[0].revenue : 0;
    const growth = lastActual ? ((nextForecast - lastActual) / lastActual) * 100 : 0;

    set("lastActualRevenue", `€${Number(lastActual).toLocaleString("en-US",{minimumFractionDigits:2})}`);
    set("nextForecastRevenue", `€${Number(nextForecast).toLocaleString("en-US",{minimumFractionDigits:2})}`);
    set("forecastGrowth", `${growth.toFixed(2)}%`);

    const canvas = document.getElementById("forecastChart");
    if (!canvas) return;
    if (forecastChart) forecastChart.destroy();

    const labels = [...historical.map(x => x.date), ...forecast.map(x => x.date)];

    forecastChart = new Chart(canvas, {
        type: "line",
        data: {
            labels,
            datasets: [
                {
                    label: "Actual Revenue",
                    data: [...historical.map(x => x.revenue), ...forecast.map(() => null)],
                    tension: 0.3
                },
                {
                    label: "Forecast Revenue",
                    data: [...historical.map(() => null), ...forecast.map(x => x.revenue)],
                    borderDash: [6,6],
                    tension: 0.3
                },
                {
                    label: "Lower Bound",
                    data: [...historical.map(() => null), ...forecast.map(x => x.lower_bound)],
                    borderDash: [3,3],
                    tension: 0.3
                },
                {
                    label: "Upper Bound",
                    data: [...historical.map(() => null), ...forecast.map(x => x.upper_bound)],
                    borderDash: [3,3],
                    tension: 0.3
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {intersect:false, mode:"index"},
            scales: {y:{beginAtZero:true}}
        }
    });
}

async function loadAnomalies() {
    const params=getFilterParams();
    const response=await fetch(`${API_URL}/api/anomalies?${params}`);
    const anomalies=await response.json();
    try {
        const monthly=await fetch(`${API_URL}/api/monthly-trend?${params}`).then(r=>r.json());
        emit3d("ba:anomalies", {anomalies, monthly});
    } catch(error) { console.warn("3D anomaly data unavailable:", error); }
    const box=document.getElementById("anomalyAlerts");
    if(!box) return;
    if(!anomalies.length){
        box.innerHTML="<p>No anomalies detected.</p>";
        return;
    }
    box.innerHTML="";
    anomalies.forEach(a=>{
        const div=document.createElement("div");
        div.className="anomaly-alert";
        div.innerHTML=`
          <div class="anomaly-title">⚠️ ${a.date}</div>
          <div class="anomaly-message">${a.message}</div>
          <div class="anomaly-growth">Change: ${Number(a.growth_percent ?? a.growth ?? 0).toFixed(2)}%</div>
          <button class="explain-button" data-date="${a.date}">Explain anomaly</button>
          <div class="anomaly-explanation" id="explain-${a.date.replaceAll("-","")}"></div>`;
        box.appendChild(div);
    });
    box.querySelectorAll(".explain-button").forEach(btn=>{
        btn.addEventListener("click",()=>explainAnomaly(btn.dataset.date));
    });
    const summary=document.getElementById("anomalySummary");
    if(summary) summary.innerHTML=`<p><strong>${anomalies.length}</strong> significant change(s) detected in the selected period.</p>`;

    const changes = anomalies.map(a => Math.abs(Number(a.growth ?? a.growth_percent ?? a.growth ?? 0)));
    const highest = changes.length ? Math.max(...changes) : 0;
    setText("riskEventCount", anomalies.length);
    setText("riskHighestChange", `${highest.toFixed(1)}%`);
    setText("riskLevel", anomalies.length === 0 ? "Low" : highest >= 100 ? "High" : highest >= 50 ? "Medium" : "Low");
}

async function explainAnomaly(date) {
    const target=document.getElementById(`explain-${date.replaceAll("-","")}`);
    if(!target) return;
    target.innerHTML="<p>Analyzing...</p>";
    const response=await fetch(`${API_URL}/api/anomalies/${date}`);
    const result=await response.json();
    target.innerHTML=`
      <div class="explanation-content">
        <h4>Possible cause</h4>
        <p>${result.message || "No explanation available."}</p>
        <div class="explanation-grid">
          <div><span>Top product</span><strong>${result.top_product || "-"}</strong></div>
          <div><span>Top region</span><strong>${result.top_region || "-"}</strong></div>
          <div><span>Current revenue</span><strong>€${Number(result.current_revenue || 0).toLocaleString("en-US",{minimumFractionDigits:2})}</strong></div>
          <div><span>Previous revenue</span><strong>€${Number(result.previous_revenue || 0).toLocaleString("en-US",{minimumFractionDigits:2})}</strong></div>
        </div>
      </div>`;
}

async function loadDatasets() {
    const response=await fetch(`${API_URL}/api/datasets`,{headers:getAuthHeaders()});
    if(handleUnauthorized(response)) return;
    const result=await response.json();
    const box=document.getElementById("datasetManager");
    if(!box) return;
    if(!result.datasets?.length){box.innerHTML="<p>No datasets uploaded yet.</p>";return;}
    box.innerHTML="";
    result.datasets.forEach(d=>{
        const div=document.createElement("div");
        div.className="dataset-item";
        div.innerHTML=`
          <div>
            <strong>${d.name}</strong>
            <p>${d.rows.toLocaleString()} rows · ${new Date(d.uploaded_at).toLocaleString()}</p>
            <span class="${d.is_active?"active-dataset":"inactive-dataset"}">${d.is_active?"Active":"Inactive"}</span>
          </div>
          <div>
            <button class="load-dataset" data-id="${d.id}">Load</button>
            <button class="delete-dataset" data-id="${d.id}">Delete</button>
          </div>`;
        box.appendChild(div);
    });
    box.querySelectorAll(".load-dataset").forEach(b=>b.addEventListener("click",()=>loadDataset(Number(b.dataset.id))));
    box.querySelectorAll(".delete-dataset").forEach(b=>b.addEventListener("click",()=>deleteDataset(Number(b.dataset.id))));
}

async function loadDataset(id) {
    const response=await fetch(`${API_URL}/api/datasets/${id}/load`,{method:"POST",headers:getAuthHeaders()});
    if(handleUnauthorized(response)) return;
    const result=await response.json();
    if(!result.success){alert(result.message||"Could not load dataset.");return;}
    alert("Dataset loaded successfully.");
    location.reload();
}

async function deleteDataset(id) {
    if(!confirm("Are you sure you want to delete this dataset?")) return;
    const response=await fetch(`${API_URL}/api/datasets/${id}`,{method:"DELETE",headers:getAuthHeaders()});
    if(handleUnauthorized(response)) return;
    const result=await response.json();
    if(!result.success){alert(result.message||"Could not delete dataset.");return;}
    await loadDatasets();
    await loadDatasetPreview();
}

let datasetRows=[];
let filteredDatasetRows=[];
let datasetColumns=[];
let currentPage=1;
let rowsPerPage=5;
let sortColumn=null;
let sortDirection="asc";

async function loadDatasetPreview() {
    const response=await fetch(`${API_URL}/api/data`);
    const result=await response.json();
    datasetRows=result.rows||[];
    datasetColumns=result.columns||[];
    filteredDatasetRows=[...datasetRows];
    currentPage=1;
    renderDatasetTable();
    const rows=document.getElementById("datasetRows");
    const cols=document.getElementById("datasetColumns");
    if(rows) rows.textContent=`Rows: ${datasetRows.length.toLocaleString()}`;
    if(cols) cols.textContent=`Columns: ${datasetColumns.length}`;
}

function renderDatasetTable() {
    const table=document.getElementById("datasetTable");
    if(!table) return;
    const thead=table.querySelector("thead");
    const tbody=table.querySelector("tbody");
    thead.innerHTML=`<tr>${datasetColumns.map(c=>`<th data-column="${c}">${c}</th>`).join("")}</tr>`;
    const start=(currentPage-1)*rowsPerPage;
    const page=filteredDatasetRows.slice(start,start+rowsPerPage);
    tbody.innerHTML=page.map(row=>`<tr>${datasetColumns.map(c=>`<td>${row[c] ?? ""}</td>`).join("")}</tr>`).join("");
    thead.querySelectorAll("th").forEach(th=>th.addEventListener("click",()=>sortDataset(th.dataset.column)));
    renderPagination();
}

function renderPagination() {
    const box=document.getElementById("pagination");
    if(!box) return;
    const totalPages=Math.max(1,Math.ceil(filteredDatasetRows.length/rowsPerPage));
    box.innerHTML="";
    const add=(text,onClick,{active=false,disabled=false,gap=false}={})=>{
        const b=document.createElement("button");
        b.textContent=text;
        if(gap){b.disabled=true;b.className="gap";}
        else{
            b.className=active?"active":"";
            b.disabled=disabled;
            if(onClick) b.onclick=onClick;
        }
        box.appendChild(b);
    };
    add("Previous",()=>{currentPage--;renderDatasetTable();},{disabled:currentPage===1});
    // first, last and a window around the current page; "…" for the gaps
    const pages=new Set([1,totalPages]);
    for(let i=currentPage-2;i<=currentPage+2;i++) if(i>=1&&i<=totalPages) pages.add(i);
    let prev=0;
    [...pages].sort((a,b)=>a-b).forEach(i=>{
        if(i-prev>1) add("…",null,{gap:true});
        add(i,()=>{currentPage=i;renderDatasetTable();},{active:i===currentPage});
        prev=i;
    });
    add("Next",()=>{currentPage++;renderDatasetTable();},{disabled:currentPage===totalPages});
}

function sortDataset(column) {
    if(sortColumn===column) sortDirection=sortDirection==="asc"?"desc":"asc";
    else {sortColumn=column;sortDirection="asc";}
    filteredDatasetRows.sort((a,b)=>{
        const av=a[column]??"", bv=b[column]??"";
        return String(av).localeCompare(String(bv),undefined,{numeric:true})*(sortDirection==="asc"?1:-1);
    });
    renderDatasetTable();
}

function setupDataPage() {
    const search=document.getElementById("datasetSearch");
    const rowsSelect=document.getElementById("rowsPerPage");
    search?.addEventListener("input",()=>{
        const q=search.value.toLowerCase();
        filteredDatasetRows=datasetRows.filter(row=>Object.values(row).some(v=>String(v).toLowerCase().includes(q)));
        currentPage=1; renderDatasetTable();
    });
    rowsSelect?.addEventListener("change",()=>{
        rowsPerPage=Number(rowsSelect.value);currentPage=1;renderDatasetTable();
    });
    document.getElementById("uploadButton")?.addEventListener("click",async()=>{
        const file=document.getElementById("csvFile")?.files[0];
        const status=document.getElementById("uploadStatus");
        if(!file){status.textContent="Please select a CSV file.";return;}
        const formData=new FormData();formData.append("file",file);status.textContent="Uploading...";
        const response=await fetch(`${API_URL}/api/upload`,{method:"POST",headers:getAuthHeaders(),body:formData});
        if(handleUnauthorized(response)) return;
        const result=await response.json();
        status.textContent=result.success?`Uploaded ${result.filename} (${result.rows} rows)`:result.message;
        if(result.success){
            localStorage.setItem("dataset_changed_at", String(Date.now()));
            await loadDatasets();
            await loadDatasetPreview();
            await loadDataQuality();
        }
    });
    document.getElementById("resetButton")?.addEventListener("click",async()=>{
        const response=await fetch(`${API_URL}/api/reset`,{method:"POST"});
        const result=await response.json();
        if(result.success){
            localStorage.setItem("dataset_changed_at", String(Date.now()));
            document.getElementById("uploadStatus").textContent="Dataset reset successfully.";
            await loadDatasetPreview();
            await loadDatasets();
            await loadDataQuality();
        }
    });
}

async function askBusinessQuestion() {
    const input=document.getElementById("businessQuestion");
    const answer=document.getElementById("businessAnswer");
    if(!input||!answer)return;
    const q=input.value.trim();
    if(!q){answer.innerHTML="<p>Please enter a question.</p>";return;}
    answer.innerHTML="<p>Analyzing your business data...</p>";
    const response=await fetch(`${API_URL}/api/business-question?question=${encodeURIComponent(q)}`,{method:"POST"});
    const result=await response.json();
    answer.innerHTML=`<p>${result.answer||"Could not analyze the question."}</p>`;
}

function setupFilters(callback) {
    document.getElementById("applyFilters")?.addEventListener("click",callback);
}

function logout() {
    localStorage.removeItem("access_token");
    window.location.href="index.html";
}

function setupNavigation() {
    document.querySelectorAll(".nav-links a").forEach(link=>{
        link.addEventListener("click",()=>{
            document.body.classList.remove("nav-open");
        });
    });
    document.getElementById("logoutButton")?.addEventListener("click",logout);

    const toggle = document.getElementById("mobileNavToggle");
    const overlay = document.getElementById("sidebarOverlay");
    toggle?.addEventListener("click",()=>document.body.classList.toggle("nav-open"));
    overlay?.addEventListener("click",()=>document.body.classList.remove("nav-open"));
    const page=document.body.dataset.page;
    document.querySelectorAll(".nav-links a").forEach(link=>{
        if(link.dataset.page===page) link.classList.add("active");
    });
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

        console.log("Current user:", data);

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

async function setupIndexAuth() {
    const auth=document.getElementById("authScreen");
    const dashboard=document.getElementById("dashboard");
    if(!auth||!dashboard)return;

    document.getElementById("loginButton")?.addEventListener("click",login);
    document.getElementById("showRegister")?.addEventListener("click",showRegister);
    document.getElementById("showLogin")?.addEventListener("click",showLogin);
    document.getElementById("registerButton")?.addEventListener("click",register);

    const nav = document.querySelector(".main-nav");
    if (localStorage.getItem("access_token")) {
    auth.classList.remove("auth-visible");
    auth.classList.add("auth-hidden");
    dashboard.classList.remove("overview-hidden");
    dashboard.classList.add("overview-visible");

    if (nav) nav.style.display="flex";

    await loadCurrentUser();
    await loadOverview();
    } else {
        if (nav) nav.style.display="none";
    }
}

function showRegister(){
    document.querySelector("#authScreen .auth-card")?.style && (document.querySelector("#authScreen .auth-card").style.display="none");
    document.getElementById("registerCard").style.display="block";
}
function showLogin(){
    document.getElementById("registerCard").style.display="none";
    document.querySelector("#authScreen .auth-card").style.display="block";
}
async function register(){
    const username=document.getElementById("registerUsername").value.trim();
    const password=document.getElementById("registerPassword").value;
    const confirm=document.getElementById("registerConfirmPassword").value;
    const msg=document.getElementById("registerMessage");
    if(!username||!password||!confirm){msg.textContent="Please fill in all fields.";return;}
    if(password!==confirm){msg.textContent="Passwords do not match.";return;}
    msg.textContent="Creating account...";
    const response=await fetch(`${API_URL}/api/register?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`,{method:"POST"});
    const result=await response.json();
    if(!result.success){msg.textContent=result.message||"Registration failed.";return;}
    showLogin();
    document.getElementById("authMessage").textContent="Account created successfully. Please login.";
}
async function login(){
    const username=document.getElementById("loginUsername").value.trim();
    const password=document.getElementById("loginPassword").value;
    const msg=document.getElementById("authMessage");
    const button=document.getElementById("loginButton");
    if(!username||!password){msg.textContent="Please enter username and password.";return;}
    msg.textContent="Logging in...";
    if(button){button.disabled=true;button.classList.add("is-loading");}
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),10000);
    try{
        const response=await fetch(`${API_URL}/api/login?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`,{method:"POST",signal:controller.signal});
        if(!response.ok) throw new Error(`Server returned ${response.status}`);
        const result=await response.json();
        if(!result.success){msg.textContent=result.message||"Login failed.";return;}
        localStorage.setItem("access_token",result.access_token);
        document.getElementById("authScreen").classList.remove("auth-visible");
        document.getElementById("authScreen").classList.add("auth-hidden");
        document.getElementById("dashboard").classList.remove("overview-hidden");
        document.getElementById("dashboard").classList.add("overview-visible");
        const nav = document.querySelector(".main-nav");
        if (nav) nav.style.display="flex";
        try{ await loadOverview(); } catch(error){ console.error("Overview load failed:",error); }
    }catch(error){
        console.error("Login request failed:",error);
        msg.textContent=error.name==="AbortError" ? "Login timed out. Make sure the FastAPI server is running on port 8000." : "Could not connect to the server. Make sure FastAPI is running on port 8000.";
    }finally{
        clearTimeout(timeout);
        if(button){button.disabled=false;button.classList.remove("is-loading");}
    }
}

let activeDatasetVersion = null;
let overviewMonitorStarted = false;

async function getActiveDatasetInfo(){
    try {
        const response = await fetch(`${API_URL}/api/datasets/active`);
        if (response.ok) return await response.json();
        // Older backends have no /active route: use the dataset list instead.
        const list = await fetch(`${API_URL}/api/datasets`);
        if (!list.ok) return null;
        const active = ((await list.json()).datasets || []).find(d => d.is_active);
        if (!active) return null;
        return {
            active: true,
            filename: active.filename || active.name,
            rows: active.rows,
            version: `${active.id}:${active.uploaded_at}`
        };
    } catch(error) {
        return null;
    }
}

async function updateOverviewDatasetStatus(info){
    const name = info.filename || "Default dataset";
    const summary = `${name} • ${Number(info.rows || 0).toLocaleString()} rows`;
    const el = document.getElementById("activeDatasetStatus");
    if (el) el.textContent = summary;
    const detail = document.getElementById("activeDatasetDetail");
    if (detail) detail.textContent = summary;
}

function startOverviewDatasetMonitor(){
    if (overviewMonitorStarted) return;
    overviewMonitorStarted = true;

    setInterval(async () => {
        const info = await getActiveDatasetInfo();
        if (!info?.active) return;

        await updateOverviewDatasetStatus(info);

        if (activeDatasetVersion === null) {
            activeDatasetVersion = info.version;
            return;
        }

        if (info.version !== activeDatasetVersion) {
            activeDatasetVersion = info.version;
            await loadOverview();
        }
    }, 3000);
}

async function loadOverview(){
    const info = await getActiveDatasetInfo();
    if (info?.active) {
        activeDatasetVersion = info.version;
        await updateOverviewDatasetStatus(info);
        setText("overviewRows", `${Number(info.rows || 0).toLocaleString()} rows`);
    }

    const meta = await fetch(`${API_URL}/api/metadata`).then(r => r.json());
    setText("overviewDateRange", `${meta.date_min} → ${meta.date_max}`);

    await Promise.all([
        loadKPIs(),
        loadMonthly(),
        loadInsights(),
        loadOverviewPerformers(),
        loadSystemHealth()
    ]);

    startOverviewDatasetMonitor();
}

async function loadSalesPage(){
    await loadMetadata();
    await loadProducts();
    await loadRegions();
    await loadMonthly();
    await setupProductDrilldown();

    const first = document.getElementById("period1From");
    const last = document.getElementById("period2To");
    if(first && !first.value) {
        const meta = await (await fetch(`${API_URL}/api/metadata`)).json();
        first.value = meta.date_min;
        document.getElementById("period1To").value = meta.date_max;
        document.getElementById("period2From").value = meta.date_min;
        last.value = meta.date_max;
    }
    document.getElementById("comparePeriods")?.addEventListener("click", comparePeriods);
    setupFilters(async()=>{
        await loadProducts();
        await loadRegions();
        await loadMonthly();
        await setupProductDrilldown();
    });
}

async function loadForecastPage(){
    document.getElementById("generateForecast")?.addEventListener("click",loadForecast);
    document.getElementById("generateScenarios")?.addEventListener("click",loadForecastScenarios);
    await loadForecast();
    await loadForecastScenarios();
}

async function loadAnomaliesPage(){
    await loadMetadata();
    await loadAnomalies();
    setupFilters(loadAnomalies);
}

async function loadDataPage(){
    await loadDatasets();
    await loadDatasetPreview();
    await loadDataQuality();
    setupDataPage();
}

async function loadAnalystPage(){
    document.getElementById("askBusinessQuestion")?.addEventListener("click",askBusinessQuestion);
    document.querySelectorAll(".question-example").forEach(btn=>{
        btn.addEventListener("click",()=>{
            const input = document.getElementById("businessQuestion");
            if (input) input.value = btn.textContent;
            askBusinessQuestion();
        });
    });
}


function setText(id, value){
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

async function loadOverviewPerformers(){
    try {
        const [products, regions, anomalies, monthly] = await Promise.all([
            fetch(`${API_URL}/api/products`).then(r=>r.json()),
            fetch(`${API_URL}/api/regions`).then(r=>r.json()),
            fetch(`${API_URL}/api/anomalies`).then(r=>r.json()),
            fetch(`${API_URL}/api/monthly-trend`).then(r=>r.json())
        ]);

        const sortedProducts = [...products].sort((a,b)=>Number(b.revenue)-Number(a.revenue));
        const sortedRegions = [...regions].sort((a,b)=>Number(b.revenue)-Number(a.revenue));

        const bestP = sortedProducts[0];
        const worstP = sortedProducts[sortedProducts.length-1];
        const bestR = sortedRegions[0];
        const worstR = sortedRegions[sortedRegions.length-1];

        setText("bestProduct", bestP?.product || "-");
        setText("bestProductValue", bestP ? `€${Number(bestP.revenue).toLocaleString("en-US",{maximumFractionDigits:0})}` : "-");
        setText("worstProduct", worstP?.product || "-");
        setText("worstProductValue", worstP ? `€${Number(worstP.revenue).toLocaleString("en-US",{maximumFractionDigits:0})}` : "-");
        setText("bestRegion", bestR?.region || "-");
        setText("bestRegionValue", bestR ? `€${Number(bestR.revenue).toLocaleString("en-US",{maximumFractionDigits:0})}` : "-");
        setText("worstRegion", worstR?.region || "-");
        setText("worstRegionValue", worstR ? `€${Number(worstR.revenue).toLocaleString("en-US",{maximumFractionDigits:0})}` : "-");

        const growth = monthly.length ? Number(monthly[monthly.length-1].growth_percent || 0) : 0;
        setText("overviewGrowth", `${growth >= 0 ? "+" : ""}${growth.toFixed(1)}%`);
        setText("overviewTopProduct", bestP?.product || "-");
        setText("overviewTopRegion", bestR?.region || "-");
        setText("overviewAnomalies", String(anomalies.length));

        const score = Math.max(0, Math.min(100, Math.round(
            70 + Math.min(Math.max(growth, -20), 20) - Math.min(anomalies.length * 8, 30)
        )));
        setText("healthScore", `${score}/100`);
    } catch(error) {
        console.error("Overview performer error:", error);
    }
}

async function loadSystemHealth(){
    try {
        const response = await fetch(`${API_URL}/api/system-health`);
        const result = await response.json();
        setText("systemFrontend", "Online");
        setText("systemApi", result.api || "Online");
        setText("systemAnalytics", result.analytics_engine || "Online");
        setText("systemDatabase", result.database || "Online");
    } catch(error) {
        setText("systemApi", "Offline");
        setText("systemAnalytics", "Unknown");
        setText("systemDatabase", "Unknown");
    }
}

async function setupProductDrilldown(){
    const select = document.getElementById("productDetailSelect");
    if (!select) return;

    const meta = await fetch(`${API_URL}/api/metadata`).then(r=>r.json());
    select.innerHTML = '<option value="">Select a product</option>' +
        meta.products.map(p=>`<option value="${encodeURIComponent(p)}">${p}</option>`).join("");

    select.onchange = async () => {
        if (!select.value) {
            document.getElementById("productDetailPanel").innerHTML =
                "<p>Select a product to view revenue, profit, margin and regional performance.</p>";
            return;
        }
        await loadProductDetail(decodeURIComponent(select.value));
    };
}

async function loadProductDetail(product){
    const panel=document.getElementById("productDetailPanel");
    if(!panel) return;
    panel.innerHTML="<p>Loading product analysis...</p>";

    try {
        const result=await fetch(`${API_URL}/api/product-detail/${encodeURIComponent(product)}`).then(r=>r.json());
        if(!result.success){panel.innerHTML="<p>Product not found.</p>";return;}

        panel.innerHTML=`
          <div class="detail-metrics">
            <div><span>Revenue</span><strong>€${Number(result.metrics.revenue).toLocaleString("en-US",{maximumFractionDigits:2})}</strong></div>
            <div><span>Profit</span><strong>€${Number(result.metrics.profit).toLocaleString("en-US",{maximumFractionDigits:2})}</strong></div>
            <div><span>Margin</span><strong>${Number(result.metrics.margin).toFixed(2)}%</strong></div>
            <div><span>Units</span><strong>${Number(result.metrics.units).toLocaleString()}</strong></div>
          </div>
          <div class="detail-breakdown">
            <div><h4>Regional Revenue</h4>${result.regions.map(r=>`
              <div class="detail-bar-row"><span>${r.region}</span><div><i style="width:${Math.min(100,(r.revenue/result.metrics.revenue)*100)}%"></i></div><b>€${Number(r.revenue).toLocaleString("en-US",{maximumFractionDigits:0})}</b></div>
            `).join("")}</div>
            <div><h4>Monthly Revenue</h4>${result.monthly.slice(-6).map(m=>`
              <div class="detail-bar-row"><span>${m.month}</span><div><i style="width:${Math.min(100,(m.revenue/Math.max(...result.monthly.map(x=>x.revenue)))*100)}%"></i></div><b>€${Number(m.revenue).toLocaleString("en-US",{maximumFractionDigits:0})}</b></div>
            `).join("")}</div>
          </div>`;
    } catch(error){
        console.error(error);
        panel.innerHTML="<p>Could not load product details.</p>";
    }
}

async function loadForecastScenarios(){
    const periods=Number(document.getElementById("scenarioPeriods")?.value || 6);
    try{
        const result=await fetch(`${API_URL}/api/forecast-scenarios?periods=${periods}`).then(r=>r.json());
        const scenarios=result.scenarios || {};
        const last=(name)=>scenarios[name]?.length ? scenarios[name][scenarios[name].length-1].revenue : 0;

        setText("scenarioPessimistic", `€${Number(last("pessimistic")).toLocaleString("en-US",{maximumFractionDigits:0})}`);
        setText("scenarioBase", `€${Number(last("base")).toLocaleString("en-US",{maximumFractionDigits:0})}`);
        setText("scenarioOptimistic", `€${Number(last("optimistic")).toLocaleString("en-US",{maximumFractionDigits:0})}`);

        const canvas=document.getElementById("scenarioChart");
        if(!canvas) return;
        if(scenarioChart) scenarioChart.destroy();

        const labels=(scenarios.base||[]).map(x=>x.date);
        scenarioChart=new Chart(canvas,{
            type:"line",
            data:{
                labels,
                datasets:[
                    {label:"Pessimistic",data:(scenarios.pessimistic||[]).map(x=>x.revenue),tension:.3},
                    {label:"Base Case",data:(scenarios.base||[]).map(x=>x.revenue),tension:.3},
                    {label:"Optimistic",data:(scenarios.optimistic||[]).map(x=>x.revenue),tension:.3}
                ]
            },
            options:{responsive:true,maintainAspectRatio:false,interaction:{intersect:false,mode:"index"},scales:{y:{beginAtZero:true}}}
        });
    }catch(error){console.error("Scenario error:",error);}
}

async function loadDataQuality(){
    try{
        const result=await fetch(`${API_URL}/api/data-quality`).then(r=>r.json());
        setText("qualityScore", `${result.quality_score}/100`);
        setText("qualityMissing", result.missing_values);
        setText("qualityDuplicates", result.duplicate_rows);
        setText("qualityDates", result.invalid_dates);
        setText("qualityNegativeSales", result.negative_sales);
    }catch(error){console.error("Data quality error:",error);}
}


async function loadSimulatorPage(){
    const controls=[
        ["priceChange","priceValue"],["unitChange","unitValue"],["costChange","costValue"]
    ];
    controls.forEach(([input,label])=>{
        const el=document.getElementById(input);
        const out=document.getElementById(label);
        el?.addEventListener("input",()=>out.textContent=`${el.value}%`);
    });
    document.getElementById("runSimulator")?.addEventListener("click",runSimulator);
    await runSimulator();
}

async function runSimulator(){
    const price=Number(document.getElementById("priceChange")?.value || 0);
    const units=Number(document.getElementById("unitChange")?.value || 0);
    const cost=Number(document.getElementById("costChange")?.value || 0);
    const currentBox=document.getElementById("simCurrent");
    const scenarioBox=document.getElementById("simScenario");
    const impactBox=document.getElementById("simImpact");

    try {
        currentBox.textContent="Calculating...";
        scenarioBox.textContent="Calculating...";
        impactBox.textContent="Calculating...";

        const response=await fetch(`${API_URL}/api/simulator?price_change=${price}&unit_change=${units}&cost_change=${cost}`);
        const result=await response.json();
        if(!response.ok) throw new Error(result.detail || "Scenario calculation failed.");

        const money=value=>`€${Number(value).toLocaleString("en-US",{maximumFractionDigits:0})}`;
        const render=x=>`
          <div class="sim-line"><span>Revenue</span><strong>${money(x.revenue)}</strong></div>
          <div class="sim-line"><span>Cost</span><strong>${money(x.cost)}</strong></div>
          <div class="sim-line"><span>Profit</span><strong>${money(x.profit)}</strong></div>
          <div class="sim-line"><span>Margin</span><strong>${Number(x.margin).toFixed(1)}%</strong></div>
          <div class="sim-line"><span>Units</span><strong>${Number(x.units).toLocaleString("en-US",{maximumFractionDigits:0})}</strong></div>
          <div class="sim-line"><span>Average price</span><strong>${money(x.average_price)}</strong></div>`;

        emit3d("ba:simulator", result);
        currentBox.innerHTML=render(result.current);
        scenarioBox.innerHTML=render(result.scenario);

        const impact=result.impact;
        impactBox.innerHTML=`
          <div class="sim-line"><span>Revenue</span><strong>${money(impact.revenue_change)} (${impact.revenue_change_pct.toFixed(1)}%)</strong></div>
          <div class="sim-line"><span>Cost</span><strong>${money(impact.cost_change)} (${impact.cost_change_pct.toFixed(1)}%)</strong></div>
          <div class="sim-line"><span>Profit</span><strong>${money(impact.profit_change)} (${impact.profit_change_pct.toFixed(1)}%)</strong></div>
          <div class="sim-line"><span>Margin</span><strong>${impact.margin_change_pp >= 0 ? "+" : ""}${impact.margin_change_pp.toFixed(1)} pp</strong></div>`;
    } catch(error) {
        console.error("Simulator error:",error);
        currentBox.textContent="Unable to calculate scenario.";
        scenarioBox.textContent=error.message;
        impactBox.textContent="No impact available.";
    }
}

async function loadGoalsPage(){
    document.getElementById("addGoal")?.addEventListener("click",addGoal);
    await refreshGoals();
}
async function refreshGoals(){
    const result=await fetch(`${API_URL}/api/goals`).then(r=>r.json());
    const kpi=await fetch(`${API_URL}/api/kpis`).then(r=>r.json());
    const values={revenue:kpi.total_revenue,profit:kpi.total_profit,margin:kpi.profit_margin,units:kpi.total_units};
    emit3d("ba:goals", {goals: result.goals||[], values});
    const box=document.getElementById("goalsList");
    if(!box)return;
    box.innerHTML=(result.goals||[]).map(g=>{
        const current=Number(values[g.metric]||0);
        const pct=Math.min(100,Math.max(0,current/Number(g.target)*100));
        return `<div class="card goal-item"><div><span>${g.metric.toUpperCase()}</span><strong>${g.metric==="margin"?current.toFixed(1)+"%":g.metric==="units"?current.toLocaleString():`€${current.toLocaleString("en-US",{maximumFractionDigits:0})}`}</strong><small>Target: ${g.metric==="margin"?Number(g.target).toFixed(1)+"%":g.metric==="units"?Number(g.target).toLocaleString():`€${Number(g.target).toLocaleString("en-US",{maximumFractionDigits:0})}`}</small></div><div class="goal-progress"><div style="width:${pct}%"></div></div><b>${pct.toFixed(0)}%</b><button onclick="removeGoal(${g.id})">×</button></div>`;
    }).join("") || `<div class="card"><p>No goals yet. Add your first target above.</p></div>`;
}
async function addGoal(){
    const metric=document.getElementById("goalMetric").value;
    const target=Number(document.getElementById("goalTarget").value);
    if(!target || target<=0)return alert("Enter a valid target.");
    await fetch(`${API_URL}/api/goals?metric=${encodeURIComponent(metric)}&target=${target}`,{method:"POST"});
    document.getElementById("goalTarget").value="";
    await refreshGoals();
}
async function removeGoal(id){
    await fetch(`${API_URL}/api/goals/${id}`,{method:"DELETE"});
    await refreshGoals();
}

async function loadReportsPage(){
    document.getElementById("generateReport")?.addEventListener("click",generateReport);
}
async function generateReport(){
    const r=await fetch(`${API_URL}/api/report-data`).then(x=>x.json());
    const title=document.getElementById("reportTitle").value;
    const period=document.getElementById("reportPeriod").value;
    const k=r.kpis;
    const box=document.getElementById("reportPreview");
    box.innerHTML=`
      <div class="report-sheet">
        <div class="report-header"><div><span>BUSINESS ANALYTICS</span><h2>${title}</h2><p>${period}</p></div><button class="secondary-action" onclick="window.print()">Print / Save PDF</button></div>
        <div class="report-kpis">
          <div><span>Revenue</span><strong>€${Number(k.total_revenue).toLocaleString()}</strong></div>
          <div><span>Profit</span><strong>€${Number(k.total_profit).toLocaleString()}</strong></div>
          <div><span>Margin</span><strong>${Number(k.profit_margin).toFixed(1)}%</strong></div>
          <div><span>Units</span><strong>${Number(k.total_units).toLocaleString()}</strong></div>
        </div>
        <div class="report-section"><h3>Performance leaders</h3><p><b>Top Product:</b> ${r.top_product?.product || "-"} — €${Number(r.top_product?.revenue||0).toLocaleString()}</p><p><b>Top Region:</b> ${r.top_region?.region || "-"} — €${Number(r.top_region?.revenue||0).toLocaleString()}</p></div>
        <div class="report-section"><h3>Risk signals</h3><p>${r.anomalies?.length || 0} significant anomaly events detected.</p></div>
        <div class="report-footer">Generated ${new Date(r.generated_at).toLocaleString()}</div>
      </div>`;
}

async function loadAlertsPage(){
    await refreshAlerts();
}
async function refreshAlerts(){
    const result=await fetch(`${API_URL}/api/alerts`).then(r=>r.json());
    const box=document.getElementById("alertsList");
    if(!box)return;
    box.innerHTML=(result.alerts||[]).map(a=>`
      <div class="card alert-item ${a.severity} ${a.is_read?"read":""}">
        <div class="alert-severity">${a.severity.toUpperCase()}</div>
        <div class="alert-content"><h3>${a.title}</h3><p>${a.message}</p><small>${new Date(a.created_at).toLocaleString()}</small></div>
        ${a.is_read?"":"<button onclick=\"markAlertRead("+a.id+")\">Mark read</button>"}
      </div>`).join("") || `<div class="card"><p>No alerts detected.</p></div>`;
}
async function markAlertRead(id){
    await fetch(`${API_URL}/api/alerts/${id}/read`,{method:"POST"});
    await refreshAlerts();
}


let customWidgetCharts = {};

async function loadDashboardPage(){
    const button=document.getElementById("addWidgetButton");
    button?.addEventListener("click", addDashboardWidget);
    await refreshCustomDashboard();
}

function dashboardCurrency(value){
    return `€${Number(value||0).toLocaleString("en-US", {minimumFractionDigits:2, maximumFractionDigits:2})}`;
}

async function refreshCustomDashboard(){
    const grid=document.getElementById("customDashboardGrid");
    if(!grid)return;
    const result=await fetch(`${API_URL}/api/dashboard/widgets`).then(r=>r.json());
    const widgets=result.widgets||[];
    Object.values(customWidgetCharts).forEach(c=>c?.destroy?.());
    customWidgetCharts={};
    if(!widgets.length){
        grid.innerHTML='<div class="card empty-dashboard"><h3>Your dashboard is empty</h3><p>Add your first KPI or chart above to start building a personalized workspace.</p></div>';
        return;
    }
    grid.innerHTML=widgets.map(w=>`<article class="card custom-widget" draggable="true" data-widget-id="${w.id}">
        <div class="custom-widget-header"><div><span class="widget-type">${w.widget_type.toUpperCase()}</span><h3>${escapeHtml(w.title)}</h3></div><button class="danger-button" onclick="deleteDashboardWidget(${w.id})">Delete</button></div>
        <div id="widgetBody-${w.id}" class="custom-widget-body"><div class="widget-loading">Loading…</div></div>
    </article>`).join('');
    widgets.forEach(loadCustomWidget);
    setupWidgetDragDrop();
}

async function loadCustomWidget(widget){
    const body=document.getElementById(`widgetBody-${widget.id}`);
    if(!body)return;
    const result=await fetch(`${API_URL}/api/dashboard/widget-data/${widget.id}`).then(r=>r.json());
    if(!result.success && result.message){body.innerHTML=`<p>${escapeHtml(result.message)}</p>`;return;}
    const rows=result.data||[];
    if(widget.widget_type==='kpi'){
        const value=rows[0]?.value||0;
        body.innerHTML=`<div class="custom-kpi-value">${widget.metric==='units'?Number(value).toLocaleString():dashboardCurrency(value)}</div><small>${widget.metric==='margin'?'Profit margin':'Current '+widget.metric}</small>`;
        return;
    }
    if(widget.widget_type==='table'){
        body.innerHTML=`<div class="widget-table-wrap"><table class="widget-table"><thead><tr><th>Category</th><th>Value</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${escapeHtml(r.label)}</td><td>${widget.metric==='units'?Number(r.value).toLocaleString():dashboardCurrency(r.value)}</td></tr>`).join('')}</tbody></table></div>`;
        return;
    }
    body.innerHTML=`<div class="custom-chart-wrap"><canvas id="widgetChart-${widget.id}"></canvas></div>`;
    const ctx=document.getElementById(`widgetChart-${widget.id}`);
    customWidgetCharts[widget.id]=new Chart(ctx,{
        type:widget.widget_type,
        data:{labels:rows.map(r=>r.label),datasets:[{label:widget.metric,data:rows.map(r=>r.value),borderWidth:2,tension:.3}]},
        options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:widget.widget_type==='pie'}}}
    });
}

async function addDashboardWidget(){
    const title=document.getElementById("widgetTitle")?.value.trim();
    const widget_type=document.getElementById("widgetType")?.value;
    const metric=document.getElementById("widgetMetric")?.value;
    let dimension=document.getElementById("widgetDimension")?.value || null;
    if(widget_type==='kpi')dimension=null;
    const msg=document.getElementById("builderMessage");
    const response=await fetch(`${API_URL}/api/dashboard/widgets?title=${encodeURIComponent(title||metric)}&widget_type=${widget_type}&metric=${metric}${dimension?`&dimension=${dimension}`:''}`,{method:"POST"});
    const result=await response.json();
    if(msg)msg.textContent=result.success?'Widget added successfully.':(result.message||'Could not add widget.');
    if(result.success){document.getElementById("widgetTitle").value='';await refreshCustomDashboard();}
}

async function deleteDashboardWidget(id){
    await fetch(`${API_URL}/api/dashboard/widgets/${id}`,{method:"DELETE"});
    await refreshCustomDashboard();
}

function setupWidgetDragDrop(){
    const cards=[...document.querySelectorAll('.custom-widget')];
    let dragged=null;
    cards.forEach(card=>{
        card.addEventListener('dragstart',()=>{dragged=card;card.classList.add('dragging');});
        card.addEventListener('dragend',async()=>{
            card.classList.remove('dragging');
            const positions=[...document.querySelectorAll('.custom-widget')].map((el,index)=>({id:Number(el.dataset.widgetId),position:index}));
            await fetch(`${API_URL}/api/dashboard/widgets/reorder`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(positions)});
        });
        card.addEventListener('dragover',e=>{e.preventDefault();if(!dragged||dragged===card)return;const rect=card.getBoundingClientRect();const before=e.clientY<rect.top+rect.height/2;card.parentNode.insertBefore(dragged,before?card:card.nextSibling);});
    });
}

function escapeHtml(value){
    return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}

function loadSettingsPage(){
    const token=localStorage.getItem("access_token");
    if(token){
        try{
            const payload=JSON.parse(atob(token.split(".")[1]));
            setText("settingsUsername",payload.sub || "Current user");
        }catch(e){}
    }
    const currency=document.getElementById("currencySetting");
    const defaultPage=document.getElementById("defaultPage");
    if(currency){currency.value=localStorage.getItem("currency")||"EUR (€)";currency.onchange=()=>localStorage.setItem("currency",currency.value);}
    if(defaultPage){defaultPage.value=localStorage.getItem("default_page")||"index.html";defaultPage.onchange=()=>localStorage.setItem("default_page",defaultPage.value);}
}

window.addEventListener("unhandledrejection", (event) => {
    console.error("Unhandled API/UI error:", event.reason);
});

document.addEventListener("DOMContentLoaded",async()=>{
    setupNavigation();
    const page=document.body.dataset.page;
    if(page==="overview"){
        setupIndexAuth();
    } else {
        if(!requireAuth()) return;
        if(page==="sales") await loadSalesPage();
        if(page==="forecast") await loadForecastPage();
        if(page==="anomalies") await loadAnomaliesPage();
        if(page==="data") await loadDataPage();
        if(page==="analyst") await loadAnalystPage();
        if(page==="simulator") await loadSimulatorPage();
        if(page==="goals") await loadGoalsPage();
        if(page==="reports") await loadReportsPage();
        if(page==="alerts") await loadAlertsPage();
        if(page==="dashboard") await loadDashboardPage();
        if(page==="settings") loadSettingsPage();
    }
});
