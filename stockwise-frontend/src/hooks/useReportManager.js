// stockwise-frontend/src/hooks/useReportManager.js
import { useState, useEffect, useCallback } from 'react';

const API_BASE_URL = 'https://stockwise-ai-86f8.onrender.com/api';

export const useReportManager = () => {
    const [report, setReport] = useState({});
    const [metrics, setMetrics] = useState({});
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchReport = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            // F8.2: Fetch the summary report 
            // FIX: Use the absolute API_BASE_URL
            const response = await fetch(`${API_BASE_URL}/reports/summary`); 
            
            if (!response.ok) {
                throw new Error(`Failed to fetch report. Status: ${response.status}`);
            }
            
            const data = await response.json();
            setReport(data);
            setMetrics(data.metrics);
            
        } catch (err) {
            console.error("Failed to fetch report:", err);
            setError("Could not load audit report. Check API connection.");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchReport();
    }, [fetchReport]);

    // F8.3: Logic to download the CSV report
    const downloadReport = async (format) => {
        try {
            // FIX: Use the absolute API_BASE_URL for download
            const response = await fetch(`${API_BASE_URL}/reports/summary?format=${format}`);
            
            if (!response.ok) {
                 throw new Error(`Failed to download report. Status: ${response.status}`);
            }
            
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            
            // Create a temporary link element to trigger the download
            const a = document.createElement('a');
            a.href = url;
            a.download = `stockwise_report_${new Date().toISOString().slice(0, 10)}.${format}`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);

        } catch (err) {
            alert(`Error during download: ${err.message}`);
        }
    };

    return { report, metrics, isLoading, error, fetchReport, downloadReport };
};