let countChart = null;
  let directChart = null;
  let currentRange = '5min';

  const initCharts = () => {
      const countCtx = document.getElementById('countChart').getContext('2d');
      const directCtx = document.getElementById('directChart').getContext('2d');

      countChart = new Chart(countCtx, {
          type: 'line',
          data: {
              labels: [],
              datasets: [{
                  label: 'Total Unique Peers',
                  data: [],
                  borderColor: '#4ade80',
                  backgroundColor: 'rgba(74, 222, 128, 0.1)',
                  tension: 0.1,
                  fill: true
              }]
          },
          options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                  legend: { display: false }
              },
              scales: {
                  y: { beginAtZero: true, grid: { color: '#222' } },
                  x: { grid: { color: '#222' } }
              }
          }
      });

      directChart = new Chart(directCtx, {
          type: 'line',
          data: {
              labels: [],
              datasets: [{
                  label: 'Direct Connections',
                  data: [],
                  borderColor: '#60a5fa',
                  backgroundColor: 'rgba(96, 165, 250, 0.1)',
                  tension: 0.1,
                  fill: true
              }]
          },
          options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                  legend: { display: false }
              },
              scales: {
                  y: { beginAtZero: true, grid: { color: '#222' } },
                  x: { grid: { color: '#222' } }
              }
          }
      });
  };

  const fetchAndUpdate = async (range) => {
      try {
          const res = await fetch(`/history/data?range=${range}`);
          const data = await res.json();

          const countLabels = data.count.map(d => new Date(d.timestamp).toLocaleTimeString());
          const countValues = data.count.map(d => d.value);

          const directLabels = data.direct.map(d => new Date(d.timestamp).toLocaleTimeString());
          const directValues = data.direct.map(d => d.value);

          countChart.data.labels = countLabels;
          countChart.data.datasets[0].data = countValues;
          countChart.update();

          directChart.data.labels = directLabels;
          directChart.data.datasets[0].data = directValues;
          directChart.update();
      } catch (err) {
          console.error('Failed to fetch history data:', err);
      }
  };

  document.addEventListener('DOMContentLoaded', () => {
      initCharts();
      fetchAndUpdate(currentRange);

      // Button listeners
      document.querySelectorAll('.time-btn').forEach(btn => {
          btn.addEventListener('click', () => {
              document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('active'));
              btn.classList.add('active');
              currentRange = btn.dataset.range;
              fetchAndUpdate(currentRange);
          });
      });

      // Auto-refresh every 10 seconds
      setInterval(() => fetchAndUpdate(currentRange), 10000);
  });