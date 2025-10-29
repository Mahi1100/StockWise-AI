import { useState, useEffect, useCallback } from 'react';

// Define the initial structure of your metrics data (matching F8.1 endpoint output)
const initialMetrics = {
    total_active_skus: 0,
    total_stock_count: 0,
    total_inventory_value_estimated: 0,
    low_stock_items_count: 0,
    total_sales_revenue: 0,
    low_stock_threshold_units: 50,
};

// Custom hook to fetch Dashboard Metrics from the backend
export const useMetrics = () => {
    const [metrics, setMetrics] = useState(initialMetrics);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchMetrics = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            // The proxy in vite.config.js directs this call to http://127.0.0.1:5000/api/dashboard/metrics
            const response = await fetch('/api/dashboard/metrics'); 
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            setMetrics(data);
        } catch (err) {
            console.error("Failed to fetch dashboard metrics:", err);
            setError("Failed to load core metrics. Is the Flask backend running?");
            setMetrics(initialMetrics);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchMetrics();
    }, [fetchMetrics]);

    return { metrics, isLoading, error, fetchMetrics };
};