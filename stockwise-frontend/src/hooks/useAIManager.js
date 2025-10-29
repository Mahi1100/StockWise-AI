// stockwise-frontend/src/hooks/useAIManager.js

const API_BASE = '/api/skus';

export const useAIManager = () => {
    
    // F5: Optimal Reorder Recommendation
    const fetchRecommendations = async (skuId, leadTime, safetyStock) => {
        try {
            const response = await fetch(`${API_BASE}/${skuId}/recommendation`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lead_time: leadTime, safety_stock: safetyStock })
            });

            const data = await response.json();

            if (!response.ok) {
                // Return the error object for display in the component
                return { error: data.error || 'Unknown error occurred.' };
            }

            // The successful response will contain the ai_recommendation string
            return data;
            
        } catch (error) {
            console.error("API Recommendation Error:", error);
            return { error: `Network error or API server issue: ${error.message}` };
        }
    };

    // F7: "What If" Scenario Analysis
    const fetchScenarioAnalysis = async (skuId, scenarioDescription) => {
         try {
            const response = await fetch(`${API_BASE}/${skuId}/whatif`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ scenario_description: scenarioDescription })
            });

            const data = await response.json();

            if (!response.ok) {
                // Return the error object for display in the component
                return { error: data.error || 'Unknown error occurred.' };
            }

            // The successful response will contain the ai_analysis string
            return data;
            
        } catch (error) {
            console.error("API Scenario Analysis Error:", error);
            return { error: `Network error or API server issue: ${error.message}` };
        }
    };

    return { fetchRecommendations, fetchScenarioAnalysis };
};