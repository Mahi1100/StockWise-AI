// stockwise-frontend/src/hooks/useMetrics.js
import { useState, useEffect, useCallback } from 'react';

// DEFINE THE DEPLOYED RENDER URL HERE (Replace with your actual URL)
// IMPORTANT: Use the full public URL of your deployed Flask backend API service.
const API_BASE_URL = 'https://stockwise-ai-86f8.onrender.com/api'; 
// If you test locally (running both servers), set this to: const API_BASE_URL = '/api';

// Define the initial structure of your metrics data
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
            // FIX: Ensure the API_BASE_URL is concatenated correctly
            const response = await fetch(`${API_BASE_URL}/dashboard/metrics`); 
            
            if (!response.ok) {
                // Check for non-200 status codes
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