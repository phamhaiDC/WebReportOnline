import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import ReportViewer from './components/ReportViewer';
import Login from './components/Login';
import HealthCheckPage from './components/HealthCheckPage';
import ConnectionsMonitorPage from './components/ConnectionsMonitorPage';
import SupersetDashboardPage from './components/SupersetDashboardPage';
import ScriptChangeLogsPage from './components/ScriptChangeLogsPage';
import { getReports, login } from './services/api';

function App() {
  const [user, setUser] = useState(null);
  const [reports, setReports] = useState([]);
  const [selectedReportId, setSelectedReportId] = useState(null);
  const [connectionError, setConnectionError] = useState(null);
  const apiUrl = `${window.location.protocol}//${window.location.hostname}:5566/api/reports`;

  // Check localStorage for existing session on mount
  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch (e) {
        console.error('Failed to parse stored user', e);
        localStorage.removeItem('user');
      }
    }
  }, []);

  // Fetch reports when user is authenticated
  useEffect(() => {
    if (user) {
      getReports()
        .then((data) => {
          setReports(data);
        })
        .catch((err) => {
          console.error('Failed to fetch reports', err);
          setConnectionError(err.message || 'Failed to connect to backend');
        });
    }
  }, [user]);

  const handleLogin = async (email, password) => {
    try {
      const response = await login(email, password);
      if (response.success) {
        const userData = response.user;
        setUser(userData);
        localStorage.setItem('user', JSON.stringify(userData));
      } else {
        throw new Error(response.message || 'Login failed');
      }
    } catch (err) {
      throw new Error(err.response?.data?.message || err.message || 'Invalid email or password');
    }
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('user');
    setReports([]);
    setSelectedReportId(null);
  };

  // Helper to find selected report in grouped structure (Recursive)
  const findReport = (id) => {
    if (!reports) return null;

    const searchItems = (items) => {
      for (const item of items) {
        if (item.id === id) return item;
        if (item.items) {
          const found = searchItems(item.items);
          if (found) return found;
        }
      }
      return null;
    };

    for (const group of reports) {
      if (group.items) {
        const found = searchItems(group.items);
        if (found) return found;
      }
    }
    return null;
  };

  const selectedReport = findReport(selectedReportId);

  // Show Login if no user
  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  // Show Main App if authenticated
  return (
    <div className="app-container">
      <Sidebar
        reports={reports}
        selectedReportId={selectedReportId}
        onSelectReport={setSelectedReportId}
      />
      <div className={`main-content${selectedReportId === 'superset-dashboard' ? ' dashboard-mode' : ''}`}>
        {/* User Info & Logout */}
        <div style={{
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          padding: '1rem 0',
          marginBottom: '1rem',
          borderBottom: '1px solid #e5e7eb'
        }}>
          <span style={{ marginRight: '1rem', color: '#6b7280', fontSize: '0.9rem' }}>
            👤 {user.email}
          </span>
          <button
            onClick={handleLogout}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#ef4444',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: '500',
              fontSize: '0.875rem'
            }}
          >
            Logout
          </button>
        </div>

        {connectionError && (
          <div style={{ padding: '1rem', backgroundColor: '#fee2e2', color: '#b91c1c', borderBottom: '1px solid #fecaca', marginBottom: '1rem' }}>
            <strong>Connection Error:</strong> {connectionError}
            <br />
            <span style={{ fontSize: '0.8rem', color: '#7f1d1d' }}>Trying to connect to: {apiUrl}</span>
            <br />
            <span style={{ fontSize: '0.8rem' }}>Check your Firewall (Port 5566) or Backend Status.</span>
          </div>
        )}
        {selectedReportId === 'sql-health-check'
          ? <HealthCheckPage />
          : selectedReportId === 'connections-monitor'
          ? <ConnectionsMonitorPage />
          : selectedReportId === 'superset-dashboard'
          ? <SupersetDashboardPage />
          : selectedReportId === 'script-changelog'
          ? <ScriptChangeLogsPage />
          : <ReportViewer reportMeta={selectedReport} />
        }
      </div>
    </div>
  );
}

export default App;
