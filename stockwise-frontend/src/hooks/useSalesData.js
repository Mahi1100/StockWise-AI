// stockwise-frontend/src/hooks/useSalesData.js
import { useState, useEffect, useCallback } from 'react';

// Hardcoded SKU ID (replace with your actual working ID if different)
// This should be the ID of the 'Organic T-Shirt, Blue' you created
const HARDCODED_SKUID = "54a1c574-4605-4b20-b2ae-65746d4517ff"; 

export const useSalesData = () => {
    const [salesData, setSalesData] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchSalesData = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            // F3.1: Fetch aggregated weekly sales data
            const response = await fetch(`/api/skus/${HARDCODED_SKUID}/sales/summary?period=W`); 
            
            if (!response.ok) {
                throw new Error(`Failed to fetch sales data. Status: ${response.status}`);
            }
            
            const result = await response.json();
            
            // Extract the sales_over_time array from the nested 'data' property
            if (result.data && result.data.sales_over_time) {
                setSalesData(result.data.sales_over_time);
            } else {
                setSalesData([]);
            }
            
        } catch (err) {
            console.error("Failed to fetch sales data:", err);
            setError("Failed to load sales trends. Ensure Flask backend is running and data exists.");
            setSalesData([]);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchSalesData();
    }, [fetchSalesData]);

    return { salesData, isLoading, error, fetchSalesData };
};