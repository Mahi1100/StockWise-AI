// stockwise-frontend/src/hooks/useAIManager.js

const API_BASE_URL = 'https://stockwise-ai-86f8.onrender.com/api';

export const useAIManager = () => {
    
    // F5: Optimal Reorder Recommendation
    const fetchRecommendations = async (skuId, leadTime, safetyStock) => {
        try {
            // FIX: Use the absolute API_BASE_URL
            const response = await fetch(`${API_BASE_URL}/skus/${skuId}/recommendation`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lead_time: leadTime, safety_stock: safetyStock })
            });

            const data = await response.json();

            if (!response.ok) {
                return { error: data.error || 'Unknown error occurred.' };
            }

            return data;
            
        } catch (error) {
            console.error("API Recommendation Error:", error);
            return { error: `Network error or API server issue: ${error.message}` };
        }
    };

    // F7: "What If" Scenario Analysis
    const fetchScenarioAnalysis = async (skuId, scenarioDescription) => {
         try {
            // FIX: Use the absolute API_BASE_URL
            const response = await fetch(`${API_BASE_URL}/skus/${skuId}/whatif`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ scenario_description: scenarioDescription })
            });

            const data = await response.json();

            if (!response.ok) {
                return { error: data.error || 'Unknown error occurred.' };
            }

            return data;
            
        } catch (error) {
            console.error("API Scenario Analysis Error:", error);
            return { error: `Network error or API server issue: ${error.message}` };
        }
    };

    return { fetchRecommendations, fetchScenarioAnalysis };
};