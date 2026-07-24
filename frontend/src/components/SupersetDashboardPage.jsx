import React, { useEffect, useRef, useState } from 'react';
import { embedDashboard } from '@superset-ui/embedded-sdk';
import { getSupersetGuestToken } from '../services/api';

//const SUPERSET_URL = 'http://192.168.2.132:8088';
const SUPERSET_URL = 'https://superset-edu.dcorp.com.vn';
const SUPERSET_EMBED_ID = '6b5a7f55-a79b-474e-8889-2d64671c9e7a';
const DEFAULT_HEIGHT = 600;
const HEIGHT_POLL_INTERVAL_MS = 2000;

export default function SupersetDashboardPage() {
    const containerRef = useRef(null);
    const [error, setError] = useState(null);
    const [height, setHeight] = useState(DEFAULT_HEIGHT);

    useEffect(() => {
        let cancelled = false;
        let pollId;

        embedDashboard({
            id: SUPERSET_EMBED_ID,
            supersetDomain: SUPERSET_URL,
            mountPoint: containerRef.current,
            fetchGuestToken: () => getSupersetGuestToken().then(data => data.token),
            dashboardUiConfig: {
                hideTitle: true,
                filters: { expanded: true }
            }
        }).then((embedded) => {
            if (cancelled) return;

            // Superset lays out charts in a fixed grid: if the iframe is shorter
            // than the dashboard's real content, rows squeeze/overlap instead of
            // just scrolling. getScrollSize() asks the embedded page for its
            // actual content height, so the iframe is sized to match instead of
            // guessing a fixed pixel value. Poll it since the height can change
            // (filters, date range, expanding/collapsing rows).
            const syncHeight = () => {
                embedded.getScrollSize()
                    .then((size) => {
                        if (!cancelled && size?.height) {
                            setHeight(size.height);
                        }
                    })
                    .catch(() => {});
            };

            syncHeight();
            pollId = setInterval(syncHeight, HEIGHT_POLL_INTERVAL_MS);
        }).catch(err => {
            if (!cancelled) {
                console.error('Failed to embed Superset dashboard', err);
                setError(err.message || 'Failed to load dashboard');
            }
        });

        return () => {
            cancelled = true;
            if (pollId) clearInterval(pollId);
        };
    }, []);

    return (
        <div className="dashboard-page">
            <div style={{ marginBottom: '1rem', padding: '0 1.5rem' }}>
                <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700, color: '#111827' }}>
                    📊 Dashboard
                </h2>
                <p style={{ margin: '0.25rem 0 0', color: '#6b7280', fontSize: '0.875rem' }}>
                    Superset embedded dashboard
                </p>
            </div>

            {error && (
                <div style={{
                    padding: '0.75rem 1rem', background: '#fee2e2', color: '#991b1b',
                    border: '1px solid #fca5a5', borderRadius: 8, marginBottom: '1rem', fontSize: '0.875rem',
                    marginLeft: '1.5rem', marginRight: '1.5rem',
                }}>
                    <strong>Lỗi:</strong> {error}
                </div>
            )}

            <div
                id="superset-container"
                ref={containerRef}
                style={{ height: `${height}px` }}
            />
        </div>
    );
}
