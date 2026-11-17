const provinceFilter = document.querySelector("#province-filter");
const yearFilter = document.querySelector("#year-filter");
const filterStatus = document.querySelector("#filter-status");
const incomeValue = document.querySelector("#median-income-value");
const giniValue = document.querySelector("#gini-value");

const provinceNames = {
  EC: "Eastern Cape",
  FS: "Free State",
  GT: "Gauteng",
  KZN: "KwaZulu-Natal",
  LIM: "Limpopo",
  MP: "Mpumalanga",
  NC: "Northern Cape",
  NW: "North West",
  WC: "Western Cape",
};

const provinceColors = [
  "#087e78",
  "#e99b45",
  "#5276a7",
  "#b45d64",
  "#7d68a8",
  "#4a9b70",
  "#d0743c",
  "#5d8791",
  "#9a7b45",
];

const currencyFormatter = new Intl.NumberFormat("en-ZA", {
  style: "currency",
  currency: "ZAR",
  maximumFractionDigits: 0,
});

let incomeRows = [];
let giniRows = [];
let charts = [];

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let insideQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (character === '"') {
      if (insideQuotes && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (character === "," && !insideQuotes) {
      row.push(field.trim());
      field = "";
    } else if ((character === "\n" || character === "\r") && !insideQuotes) {
      if (character === "\r" && text[index + 1] === "\n") {
        index += 1;
      }
      row.push(field.trim());
      if (row.some((value) => value !== "")) {
        rows.push(row);
      }
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  row.push(field.trim());
  if (row.some((value) => value !== "")) {
    rows.push(row);
  }

  if (insideQuotes) {
    throw new Error("A CSV file contains an unfinished quoted field.");
  }

  const [header, ...records] = rows;
  if (!header) {
    throw new Error("A CSV file is empty.");
  }

  return records.map((values) =>
    Object.fromEntries(header.map((name, index) => [name, values[index] ?? ""])),
  );
}

async function loadCsv(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Could not load ${path} (HTTP ${response.status}).`);
  }
  return parseCsv(await response.text());
}

function toRecords(rows, valueColumn) {
  return rows.flatMap((row) => {
    const value = Number(row[valueColumn]);
    const year = Number(row.TaxYear);

    if (
      !provinceNames[row.PROVINCE] ||
      !Number.isFinite(year) ||
      !Number.isFinite(value)
    ) {
      return [];
    }

    return [{ province: row.PROVINCE, year, value }];
  });
}

function getFilteredRows(rows) {
  const selectedProvince = provinceFilter.value;
  const selectedYear = yearFilter.value;

  return rows.filter(
    (row) =>
      (selectedProvince === "all" || row.province === selectedProvince) &&
      (selectedYear === "all" || row.year === Number(selectedYear)),
  );
}

function average(values) {
  if (values.length === 0) {
    return null;
  }
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function makeLineChartConfig(rows) {
  const years = [...new Set(rows.map((row) => row.year))].sort((a, b) => a - b);
  const selectedProvince = provinceFilter.value;
  const provinces =
    selectedProvince === "all"
      ? Object.keys(provinceNames)
      : [selectedProvince];

  return {
    type: "line",
    data: {
      labels: years,
      datasets: provinces.map((province, index) => ({
        label: provinceNames[province],
        data: years.map(
          (year) =>
            rows.find(
              (row) => row.province === province && row.year === year,
            )?.value ?? null,
        ),
        borderColor: provinceColors[index % provinceColors.length],
        backgroundColor: provinceColors[index % provinceColors.length],
        borderWidth: 2,
        pointRadius: 2,
        pointHoverRadius: 5,
        tension: 0.25,
        spanGaps: true,
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { position: "bottom", labels: { usePointStyle: true, boxWidth: 8 } },
        tooltip: {
          callbacks: {
            label: (context) =>
              `${context.dataset.label}: ${currencyFormatter.format(context.parsed.y)}`,
          },
        },
      },
      scales: {
        x: { title: { display: true, text: "Tax year" } },
        y: {
          beginAtZero: false,
          title: { display: true, text: "Median income (ZAR)" },
          ticks: {
            callback: (value) => currencyFormatter.format(value),
          },
        },
      },
    },
  };
}

function makeProvinceChartConfig(rows, label, color, valueFormatter, axisTitle) {
  const valuesByProvince = Object.keys(provinceNames).map((province) => {
    const provinceRows = rows.filter((row) => row.province === province);
    return {
      province,
      value: average(provinceRows.map((row) => row.value)),
    };
  });

  return {
    type: "bar",
    data: {
      labels: valuesByProvince.map(({ province }) => provinceNames[province]),
      datasets: [
        {
          label,
          data: valuesByProvince.map(({ value }) => value),
          backgroundColor: valuesByProvince.map((_, index) =>
            provinceFilter.value !== "all" &&
            valuesByProvince[index].province === provinceFilter.value
              ? color
              : `${color}b3`,
          ),
          borderRadius: 5,
          maxBarThickness: 38,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context) =>
              context.parsed.y === null
                ? "No data"
                : valueFormatter(context.parsed.y),
          },
        },
      },
      scales: {
        x: { grid: { display: false } },
        y: {
          beginAtZero: false,
          title: { display: true, text: axisTitle },
          ticks: {
            callback: (value) => valueFormatter(value),
          },
        },
      },
    },
  };
}

function updateDashboard() {
  const filteredIncome = getFilteredRows(incomeRows);
  const filteredGini = getFilteredRows(giniRows);
  const meanIncome = average(filteredIncome.map((row) => row.value));
  const meanGini = average(filteredGini.map((row) => row.value));

  incomeValue.textContent =
    meanIncome === null ? "No data" : currencyFormatter.format(meanIncome);
  giniValue.textContent = meanGini === null ? "No data" : meanGini.toFixed(3);

  const provinceText =
    provinceFilter.value === "all"
      ? "all provinces"
      : provinceNames[provinceFilter.value];
  const yearText =
    yearFilter.value === "all" ? "all years" : yearFilter.value;
  filterStatus.textContent =
    `Showing ${provinceText} for ${yearText}. ` +
    "Unknown-location head office records are excluded.";

  charts.forEach((chart) => chart.destroy());
  charts = [
    new Chart(
      document.querySelector("#income-trend-chart"),
      makeLineChartConfig(filteredIncome),
    ),
    new Chart(
      document.querySelector("#province-income-chart"),
      makeProvinceChartConfig(
        filteredIncome,
        "Average median income",
        "#087e78",
        (value) => currencyFormatter.format(value),
        "Median income (ZAR)",
      ),
    ),
    new Chart(
      document.querySelector("#gini-chart"),
      makeProvinceChartConfig(
        filteredGini,
        "Average Gini coefficient",
        "#e99b45",
        (value) => value.toFixed(3),
        "Gini coefficient",
      ),
    ),
  ];
}

function showError(message) {
  filterStatus.textContent = `Dashboard could not load: ${message}`;
  incomeValue.textContent = "Unavailable";
  giniValue.textContent = "Unavailable";
}

async function startDashboard() {
  const requiredElements = [
    provinceFilter,
    yearFilter,
    filterStatus,
    incomeValue,
    giniValue,
    document.querySelector("#income-trend-chart"),
    document.querySelector("#province-income-chart"),
    document.querySelector("#gini-chart"),
  ];

  if (requiredElements.some((element) => !element)) {
    console.error("The dashboard HTML is missing an element required by app.js.");
    return;
  }
  if (typeof Chart === "undefined") {
    showError("the Chart.js library did not load.");
    return;
  }

  try {
    const [incomeData, giniData] = await Promise.all([
      loadCsv("./Province_Data/Province_MedianIncome.csv"),
      loadCsv("./Province_Data/Province_Gini.csv"),
    ]);

    incomeRows = toRecords(incomeData, "MedianIncome");
    giniRows = toRecords(giniData, "gini");

    if (incomeRows.length === 0 || giniRows.length === 0) {
      throw new Error("The CSV files do not contain usable province data.");
    }

    provinceFilter.addEventListener("change", updateDashboard);
    yearFilter.addEventListener("change", updateDashboard);
    updateDashboard();
  } catch (error) {
    console.error("Failed to load dashboard data.", error);
    showError(error.message);
  }
}

startDashboard();