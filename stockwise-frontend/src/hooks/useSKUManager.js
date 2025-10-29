// stockwise-frontend/src/hooks/useSKUManager.js
import { useState, useEffect, useCallback } from 'react';

// Define the absolute API URL for the deployed Render service.
// This ensures all hooks connect to the live backend.
const API_BASE_URL = 'https://stockwise-ai-86f8.onrender.com/api'; 
// If testing locally (both servers running), use: const API_BASE_URL = '/api';

export const useSKUManager = () => {
    const [skus, setSkus] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    // READ: Fetch all SKUs (F1.2, F1.6)
    const fetchSkus = useCallback(async (searchQuery = '') => {
        setIsLoading(true);
        setError(null);
        try {
            // FIX: Use the absolute API_BASE_URL for all fetches
            const url = searchQuery ? 
                `${API_BASE_URL}/skus?search=${searchQuery}` : 
                `${API_BASE_URL}/skus`;
                
            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error(`Failed to fetch SKUs. Status: ${response.status}`);
            }
            
            const data = await response.json();
            setSkus(data);
        } catch (err) {
            console.error("Failed to fetch SKUs:", err);
            setError("Could not load SKU list. Check API connection.");
            setSkus([]);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchSkus();
    }, [fetchSkus]);


    // CREATE: Add a new SKU (F1.1)
    const addSku = async (newSkuData) => {
        try {
            const response = await fetch(`${API_BASE_URL}/skus`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newSkuData)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `Failed to add SKU. Status: ${response.status}`);
            }

            await fetchSkus();
            return true;
        } catch (err) {
            setError(err.message);
            return false;
        }
    };


    // UPDATE: Edit SKU details (F1.3)
    const updateSkuDetails = async (skuId, updatedDetails) => {
        try {
            const response = await fetch(`${API_BASE_URL}/skus/${skuId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedDetails)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `Failed to update SKU. Status: ${response.status}`);
            }

            await fetchSkus();
            return true;
        } catch (err) {
            setError(err.message);
            return false;
        }
    };


    // PATCH: Update stock level (F1.4)
    const updateSkuStock = async (skuId, newStockLevel) => {
        try {
            const response = await fetch(`${API_BASE_URL}/skus/${skuId}/stock`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ new_stock_level: parseInt(newStockLevel) })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `Failed to update stock. Status: ${response.status}`);
            }

            await fetchSkus();
            return true;
        } catch (err) {
            setError(err.message);
            return false;
        }
    };

    return { skus, isLoading, error, fetchSkus, addSku, updateSkuDetails, updateSkuStock };
};