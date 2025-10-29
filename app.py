from flask import Flask, request, jsonify, make_response
from mongoengine import connect, DoesNotExist, ValidationError, DictField
from models import SKU, Sale, Supplier, PurchaseOrder, AIHistory # Import all models
from dotenv import load_dotenv
import os
import uuid
from datetime import datetime, timedelta, timezone # Added timezone
import pandas as pd 
from google import genai 
from google.genai.errors import APIError 
from dateutil import parser # NOTE: Pylance warning for this is fine if installed, but we use built-in methods
# app.py (Near the top with other imports)
from flask import Flask, request, jsonify, make_response
# ... other imports
from flask_cors import CORS
import json

# Load environment variables from .env file
load_dotenv()

# Initialize Flask application
app = Flask(__name__)
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY')

# CRITICAL FIX: Initialize CORS to allow frontend connections
CORS(app)
# Connect to MongoDB
try:
    connect(host=os.getenv('MONGO_URI'))
    print("Successfully connected to MongoDB.")
except Exception as e:
    print(f"Error connecting to MongoDB: {e}")
    exit()

# Initialize the Gemini Client for LLM integration
GEMINI_MODEL = "gemini-2.5-flash" 
try:
    gemini_client = genai.Client(api_key=os.getenv('GEMINI_API_KEY'))
    print(f"Successfully initialized Gemini Client for model: {GEMINI_MODEL}")
except Exception as e:
    print(f"Error initializing Gemini Client: {e}")
    gemini_client = None

@app.route('/')
def index():
    """Handle root path health check by redirecting or returning a simple message."""
    return jsonify({"message": "StockWise AI API is active. Access services via /api/..."}), 200

@app.route('/api/health', methods=['GET'])
def health_check():
    """Defines the explicit health check path for Render."""
    # The logic below is what we created earlier to check MongoDB and API status
    try:
        sku_count = SKU.objects.count() 
        return jsonify({
            "status": "OK",
            "database_status": "Connected",
            "sku_count": sku_count
        }), 200

    except Exception as e:
        return jsonify({
            "status": "Service Degraded",
            "database_status": "Error",
            "message": str(e)
        }), 500
# ==============================================================================
# HELPER FUNCTIONS FOR DATE PARSING AND METRICS
# ==============================================================================

def parse_safe_date(date_str):
    """
    Robustly parses date string using built-in methods, falling back to UTC now.
    This resolves the persistent format error.
    """
    if not date_str:
        return datetime.now(timezone.utc)
        
    # Define common formats expected (YYYY-MM-DD from form input, and ISO for internal/API use)
    DATE_FORMATS = ['%Y-%m-%d', '%Y-%m-%dT%H:%M:%S.%fZ', '%Y-%m-%d %H:%M:%S']
    
    for fmt in DATE_FORMATS:
        try:
            # Attempt to parse the date string using the specific format
            dt = datetime.strptime(date_str, fmt)
            # Ensure the result is timezone-aware (safer for database)
            return dt.replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    
    # Final fallback if all formats fail, ensuring a crash is avoided
    print(f"Warning: Could not parse date string: {date_str}. Using current UTC time.")
    return datetime.now(timezone.utc)


def get_sales_data_for_analysis(sku_id):
    """Retrieves raw sales data and SKU details without HTTP context."""
    
    # 1. Retrieve SKU Details
    sku = SKU.objects.get(skuid=uuid.UUID(sku_id))
    
    # 2. Retrieve all sales for the SKU (F2.3)
    sales_queryset = Sale.objects(skuid=sku.skuid).order_by('sale_date').only(
        'sale_date', 'quantity_sold'
    )
    
    # 3. Convert QuerySet of objects to a list of Python dictionaries for Pandas
    raw_sales = [
        {
            'sale_date': sale.sale_date,
            'quantity_sold': sale.quantity_sold
        }
        for sale in sales_queryset
    ]
    
    return sku, raw_sales


def calculate_sales_trends(raw_sales, period='W'):
    """
    Processes raw sales data to calculate aggregated sales over time using Pandas.
    F3.1, F3.2: Trend Spotting Logic.
    """
    if not raw_sales:
        return {
            "sales_over_time": [],
            "average_sales_per_period": 0,
            "total_sales_count": 0
        }
        
    df = pd.DataFrame(raw_sales)
    df['sale_date'] = pd.to_datetime(df['sale_date'])
    df = df.set_index('sale_date')

    # Aggregate QuantitySold by the specified period (e.g., 'W' for weekly)
    sales_trend = df['quantity_sold'].resample(period).sum().fillna(0)
    
    sales_list = [{
        "period_end": index.strftime('%Y-%m-%d'),
        "quantity_sold": int(value)
    } for index, value in sales_trend.items()]

    # Calculate the average sales for trend spotting
    average_sales = sales_trend.mean() if not sales_trend.empty else 0
    
    return {
        "sales_over_time": sales_list,
        "average_sales_per_period": round(average_sales, 2),
        "total_sales_count": int(df['quantity_sold'].sum())
    }


def calculate_metrics():
    """
    F8.1: Internal helper function to fetch and calculate key inventory metrics.
    Includes the LAST SAVED AI Recommendation text.
    """
    
    active_skus = SKU.objects(is_active=1)
    all_sales = Sale.objects()

    total_active_skus = active_skus.count() 
    total_stock_value = 0
    total_stock_count = 0
    low_stock_items = 0
    LOW_STOCK_THRESHOLD = 50 
    
    for sku in active_skus:
        total_stock_count += sku.current_stock_level
        # Assuming an average unit cost of $25 for simplicity
        total_stock_value += sku.current_stock_level * 25 
        
        if sku.current_stock_level <= LOW_STOCK_THRESHOLD:
            low_stock_items += 1 

    total_sales_revenue = sum(sale.quantity_sold * sale.selling_price for sale in all_sales)
    
    # Retrieve the latest SAVED recommendation (F5.3 Display)
    last_recommendation_obj = AIHistory.objects(insight_type='Recommendation').order_by('-created_at').first()
    last_recommendation_text = last_recommendation_obj.ai_output if last_recommendation_obj else "No recommendations generated yet. Run AI Forecasting to populate."
    
    return {
        "total_active_skus": total_active_skus, 
        "total_stock_count": total_stock_count,
        "total_inventory_value_estimated": round(total_stock_value, 2), 
        "low_stock_items_count": low_stock_items, 
        "total_sales_revenue": round(total_sales_revenue, 2),
        "low_stock_threshold_units": LOW_STOCK_THRESHOLD,
        "last_ai_recommendation": last_recommendation_text 
    }


# ==============================================================================
# 3.2.1 F1: SKU and Inventory Management Endpoints
# ==============================================================================

@app.route('/api/skus', methods=['POST'])
def add_new_sku():
    """F1.1: The system shall allow authenticated users to add new SKUs."""
    data = request.get_json()
    if not all(key in data for key in ['sku_name', 'unit_of_measure']):
        return jsonify({"error": "Missing required fields: sku_name, unit_of_measure"}), 400

    try:
        new_sku = SKU(
            sku_name=data['sku_name'],
            sku_description=data.get('sku_description', ''),
            unit_of_measure=data['unit_of_measure'],
            current_stock_level=data.get('initial_stock_level', 0) 
        )
        new_sku.save()
        return jsonify({"message": "SKU added successfully", "sku_id": str(new_sku.skuid)}), 201
    except ValidationError as e:
        return jsonify({"error": str(e)}), 400

@app.route('/api/skus', methods=['GET'])
def get_all_skus():
    """F1.2, F1.6: View a list of all active SKUs, with search/filter options."""
    search_query = request.args.get('search', '')
    query = SKU.objects(is_active=1)
    
    if search_query:
        query = query.filter(
            (SKU.sku_name.icontains(search_query)) | 
            (SKU.skuid.icontains(search_query))
        )
    
    skus = query.order_by('-sku_name')
    
    sku_list = [{
        "skuid": str(sku.skuid),
        "sku_name": sku.sku_name,
        "description": sku.sku_description,
        "unit_of_measure": sku.unit_of_measure,
        "current_stock_level": sku.current_stock_level
    } for sku in skus]

    return jsonify(sku_list), 200

@app.route('/api/skus/<sku_id>', methods=['GET'])
def get_single_sku(sku_id):
    """Retrieves details and current status for a single SKU (Final check of F6.4)."""
    try:
        sku = SKU.objects.get(skuid=uuid.UUID(sku_id))
        
        return jsonify({
            "skuid": str(sku.skuid),
            "sku_name": sku.sku_name,
            "description": sku.sku_description,
            "unit_of_measure": sku.unit_of_measure,
            "current_stock_level": sku.current_stock_level,
            "is_active": bool(sku.is_active)
        }), 200
    except DoesNotExist:
        return jsonify({"error": "SKU not found"}), 404
    except ValueError:
        return jsonify({"error": "Invalid SKU ID format"}), 400

@app.route('/api/skus/<sku_id>', methods=['PUT'])
def update_sku_details(sku_id):
    """F1.3: The system shall allow authenticated users to edit existing SKU details."""
    data = request.get_json()
    try:
        sku = SKU.objects.get(skuid=uuid.UUID(sku_id))
        
        if 'sku_name' in data:
            sku.sku_name = data['sku_name']
        if 'sku_description' in data:
            sku.sku_description = data['sku_description']
        if 'unit_of_measure' in data:
            sku.unit_of_measure = data['unit_of_measure']

        sku.save()
        return jsonify({"message": f"SKU {sku_id} details updated successfully"}), 200
    except DoesNotExist:
        return jsonify({"error": "SKU not found"}), 404
    except ValidationError as e:
        return jsonify({"error": str(e)}), 400
    except ValueError:
        return jsonify({"error": "Invalid SKU ID format"}), 400

@app.route('/api/skus/<sku_id>/stock', methods=['PATCH'])
def update_stock_level(sku_id):
    """F1.4: The system shall allow authenticated users to update the current stock level."""
    data = request.get_json()
    if 'new_stock_level' not in data:
        return jsonify({"error": "Missing field: new_stock_level"}), 400

    try:
        new_level = int(data['new_stock_level'])
        if new_level < 0:
             return jsonify({"error": "Stock level cannot be negative"}), 400
             
        sku = SKU.objects.get(skuid=uuid.UUID(sku_id))
        sku.current_stock_level = new_level 
        sku.save()
        return jsonify({"message": f"Stock level for SKU {sku_id} updated to {new_level}"}), 200
    except DoesNotExist:
        return jsonify({"error": "SKU not found"}), 404
    except ValueError:
        return jsonify({"error": "Invalid SKU ID or stock level format"}), 400
    except Exception as e:
        return jsonify({"error": f"An internal error occurred: {e}"}), 500


# ==============================================================================
# 3.2.2 F2: Sales Data Recording and Management Endpoints
# ==============================================================================

@app.route('/api/sales', methods=['POST'])
def record_sale():
    """F2.1 & F2.2: The system shall allow manual sales input and auto-adjust stock."""
    data = request.get_json()
    required_fields = ['skuid', 'quantity_sold', 'selling_price']
    if not all(key in data for key in required_fields):
        return jsonify({"error": f"Missing required fields: {', '.join(required_fields)}"}), 400

    try:
        # CRITICAL FIX 1: Strip whitespace and safely convert UUID
        sku_id = uuid.UUID(data['skuid'].strip()) 
        
        # CRITICAL FIX 2: Safely convert Quantity Sold and Selling Price, handling potential empty/None values
        quantity_data = data.get('quantity_sold')
        quantity_sold = int(quantity_data) if quantity_data not in [None, ''] else 0
        
        price_data = data.get('selling_price')
        selling_price = float(price_data) if price_data not in [None, ''] else 0.00
        
        sale_date_str = data.get('sale_date')
        
        # FIX 3: Robustly parse the date string
        sale_datetime = parse_safe_date(sale_date_str)

        # --- BUSINESS VALIDATION ---
        if quantity_sold <= 0 or selling_price <= 0.0:
            return jsonify({"error": "Quantity sold and selling price must be positive."}), 400

        # 1. Find the SKU and perform stock check/adjustment (Transactional consistency S3)
        sku = SKU.objects.get(skuid=sku_id)
        
        if sku.current_stock_level < quantity_sold:
            return jsonify({"error": "Sale failed. Insufficient stock level."}), 400

        # 2. Record the sale transaction (F2.1)
        new_sale = Sale(
            skuid=sku_id,
            quantity_sold=quantity_sold, 
            selling_price=selling_price, 
            sale_date=sale_datetime # Use the successfully parsed datetime object
        )
        new_sale.save()
        
        # 3. Automatically adjust the current stock level (F2.2)
        sku.current_stock_level -= quantity_sold 
        sku.save()
        
        return jsonify({
            "message": "Sale recorded and stock adjusted successfully", 
            "sale_id": str(new_sale.sale_id), 
            "new_stock": sku.current_stock_level
        }), 201

    except DoesNotExist:
        return jsonify({"error": "SKU not found"}), 404
    except ValidationError as e:
        return jsonify({"error": str(e)}), 400
    except (ValueError, TypeError) as e:
        # Catch any final conversion errors not handled above
        return jsonify({"error": f"Invalid format for SKU ID, quantity, price, or date: {str(e)}"}), 400
    except Exception as e:
        return jsonify({"error": f"An internal error occurred: {e}"}), 500


# ==============================================================================
# 3.2.3 F3: Historical Sales Visualization and Basic Trend Spotting Endpoints
# ==============================================================================

@app.route('/api/skus/<sku_id>/sales/summary', methods=['GET'])
def get_sales_summary(sku_id):
    """
    F2.3, F3.1, F3.2: Retrieves historical sales data and provides summarized trend analysis.
    """
    try:
        sku, raw_sales = get_sales_data_for_analysis(sku_id)
    except DoesNotExist:
        return jsonify({"error": "SKU not found"}), 404
    except ValueError:
        return jsonify({"error": "Invalid SKU ID format"}), 400

    period = request.args.get('period', 'W').upper()
    
    # F3.3: Filter logic
    start_date_str = request.args.get('start_date')
    end_date_str = request.args.get('end_date')
    
    if start_date_str and end_date_str:
        filtered_sales = [
            sale for sale in raw_sales 
            if start_date_str <= sale['sale_date'].strftime('%Y-%m-%d') <= end_date_str
        ]
        summary = calculate_sales_trends(filtered_sales, period)
    else:
        summary = calculate_sales_trends(raw_sales, period)

    return jsonify({
        "sku_name": sku.sku_name,
        "stock_level": sku.current_stock_level,
        "time_period": period,
        "data": summary
    }), 200

# ==============================================================================
# 3.2.4 F4: AI-Powered Demand Suggestion Endpoint (INCREMENT 3)
# ==============================================================================

@app.route('/api/skus/<sku_id>/forecast', methods=['POST'])
def get_demand_suggestion(sku_id):
    """
    F4.1-F4.4: Requests an AI-generated demand forecast based on structured data and context.
    """
    if not gemini_client:
        return jsonify({
            "error": "AI service temporarily unavailable.",
            "detail": "Please check API key or LLM service status."
        }), 503 

    data = request.get_json()
    forecast_period = data.get('forecast_period', 'next 4 weeks') 
    external_factors = data.get('external_factors', '')          
    
    try:
        sku, raw_sales = get_sales_data_for_analysis(sku_id)
        
        sales_trend_data = calculate_sales_trends(raw_sales, period='W') 
        historical_sales_json = json.dumps(sales_trend_data['sales_over_time'])
        average_sales = sales_trend_data['average_sales_per_period']

        # F4.2: Construct the Sophisticated Prompt
        system_prompt = (
            "You are StockWise AI, an expert inventory planning analyst. Your task is to provide a contextual demand forecast "
            "for a small business product. Combine the historical sales trends with any provided qualitative context."
            "The final output must be a plain-language explanation of the expected demand, clearly stating the "
            "reasoning based on the data and the context. Use the average sales trend to inform your prediction."
        )

        user_prompt = f"""
        SKU Name: {sku.sku_name}
        SKU Description: {sku.sku_description}
        Forecast Period: {forecast_period}
        
        Historical Sales (Aggregated Weekly Data): {historical_sales_json}
        Average Weekly Sales (Units): {average_sales}
        
        Qualitative Context/External Factors (if any): {external_factors}
        
        Based on this data, provide a Plain-Language Demand Suggestion for the "{forecast_period}" period. 
        Also, provide a single, most likely **Numerical Forecast (integer units)** for the demand during this period, 
        making sure to explain the change from the average based on the external factors.
        """
        
        response = gemini_client.models.generate_content(
            model=GEMINI_MODEL,
            contents=[system_prompt, user_prompt],
        )

        # F4.3: Save and Return the Plain-Language Insight 
        new_log = AIHistory(
            skuid=uuid.UUID(sku_id),
            insight_type='Forecast',
            ai_output=response.text.strip(),
            input_params={
                "forecast_period": forecast_period,
                "external_factors": external_factors,
                "average_sales_units": average_sales
            }
        )
        new_log.save()
        
        return jsonify({
            "sku_id": sku_id,
            "sku_name": sku.sku_name,
            "forecast_period": forecast_period,
            "external_factors": external_factors,
            "ai_suggestion": response.text.strip() # F4.3 DemandSuggestion
        }), 200

    except DoesNotExist:
        return jsonify({"error": "SKU not found"}), 404
    except APIError as e:
        return jsonify({"error": f"LLM API Error: {e}"}), 500
    except Exception as e:
        return jsonify({"error": f"An internal error occurred: {e}"}), 500

# ==============================================================================
# 3.2.5 F5: Optimal Reorder Point & Quantity Recommendations Endpoint (INCREMENT 3)
# ==============================================================================

@app.route('/api/skus/<sku_id>/recommendation', methods=['POST'])
def get_reorder_recommendation(sku_id):
    """
    F5.1-F5.3: Generates actionable reorder recommendations, implementing the New Product Logic.
    """
    if not gemini_client:
        return jsonify({"error": "AI service temporarily unavailable."}), 503 

    data = request.get_json()
    lead_time = data.get('lead_time', 7)  
    safety_stock = data.get('safety_stock', 50) 
    
    if not isinstance(lead_time, int) or not isinstance(safety_stock, int) or lead_time <= 0 or safety_stock < 0:
         return jsonify({"error": "Lead time and Safety Stock must be valid non-negative integers."}), 400

    try:
        sku, raw_sales = get_sales_data_for_analysis(sku_id)
        current_stock = sku.current_stock_level
        
        sales_trend_data = calculate_sales_trends(raw_sales, period='W') 
        average_weekly_sales = sales_trend_data['average_sales_per_period']
        
        # --------------------------------------------------------
        # FIX: NEW PRODUCT LOGIC (Addressing Zero Demand)
        # --------------------------------------------------------
        MINIMUM_ASSUMED_WEEKLY_DEMAND = 15  # Baseline assumption for new/zero-history products
        
        # Use the higher of the calculated average or the minimum assumption
        baseline_demand = max(average_weekly_sales, MINIMUM_ASSUMED_WEEKLY_DEMAND)
        
        # Prepare an explanation for the LLM if we substitute the demand
        demand_explanation = ""
        if average_weekly_sales < MINIMUM_ASSUMED_WEEKLY_DEMAND:
             demand_explanation = f"NOTE: Actual sales history is zero. Forecasting uses a conservative baseline demand of {MINIMUM_ASSUMED_WEEKLY_DEMAND} units per week for calculation."
        # --------------------------------------------------------

        # 2. Construct the Recommendation Prompt (F5.2)
        system_prompt = (
            "You are StockWise AI, an expert inventory manager. Your task is to calculate and provide "
            "concrete, actionable reorder recommendations based on the provided inputs. "
            "The output MUST be a plain-language instruction, starting with 'Actionable Recommendation:', followed by the suggested point and quantity. "
            "Ensure the calculation is accurate based on the formulas provided."
        )

        user_prompt = f"""
        SKU Name: {sku.sku_name}
        Current Stock Level: {current_stock} units
        
        # CRITICAL INPUT FOR CALCULATION: Use the determined baseline demand
        Average Weekly Demand: {baseline_demand} units
        
        Supplier Lead Time (days): {lead_time}
        Safety Stock (units): {safety_stock}
        
        # Include the demand explanation in the prompt
        {demand_explanation}

        Formulas to use:
        - Average Daily Demand = Average Weekly Demand / 7
        - Reorder Point (units) = (Average Daily Demand * Lead Time in Days) + Safety Stock
        - Reorder Quantity (units) = Must cover at least the next 4 weeks of average demand (4 * Average Weekly Demand).

        Task: Based on the data above, provide the optimal Reorder Point and Reorder Quantity in plain, simple language.
        """
        
        # 3. Call the LLM API (F5.2)
        response = gemini_client.models.generate_content(
            model=GEMINI_MODEL,
            contents=[system_prompt, user_prompt],
        )

        # 4. SAVE the recommendation history (U5 Postcondition)
        new_log = AIHistory(
            skuid=uuid.UUID(sku_id),
            insight_type='Recommendation',
            ai_output=response.text.strip(),
            input_params={
                "lead_time_days": lead_time,
                "safety_stock_units": safety_stock,
                "current_stock": current_stock,
                "average_weekly_sales_used": baseline_demand # Log the value used for calculation
            }
        )
        new_log.save()
        
        # 5. Return the Actionable Recommendation (F5.3)
        return jsonify({
            "sku_id": sku_id,
            "sku_name": sku.sku_name,
            "current_stock_level": current_stock,
            "lead_time_days": lead_time,
            "safety_stock_units": safety_stock,
            "ai_recommendation": response.text.strip() 
        }), 200

    except DoesNotExist:
        return jsonify({"error": "SKU not found"}), 404
    except APIError as e:
        return jsonify({"error": f"LLM API Error: {e}"}), 500
    except Exception as e:
        return jsonify({"error": f"An internal error occurred: {e}"}), 500


# ==============================================================================
# 3.2.6 F6: Supplier Management and Order Tracking Endpoints (INCREMENT 4)
# ==============================================================================

@app.route('/api/suppliers', methods=['POST'])
def add_supplier():
    """F6.1: The system shall allow authenticated users to add supplier information."""
    data = request.get_json()
    if 'supplier_name' not in data:
        return jsonify({"error": "Missing required field: supplier_name"}), 400
    
    try:
        new_supplier = Supplier(
            supplier_name=data['supplier_name'],
            contact_info=data.get('contact_info', ''),
            notes=data.get('notes', '')
        )
        new_supplier.save()
        return jsonify({"message": "Supplier added successfully", "supplier_id": str(new_supplier.supplier_id)}), 201
    except ValidationError as e:
        return jsonify({"error": str(e)}), 400

@app.route('/api/suppliers', methods=['GET'])
def list_suppliers():
    """F6.1: List all suppliers."""
    suppliers = Supplier.objects().order_by('supplier_name')
    supplier_list = [{
        "supplier_id": str(s.supplier_id),
        "supplier_name": s.supplier_name,
        "contact_info": s.contact_info
    } for s in suppliers]
    return jsonify(supplier_list), 200

@app.route('/api/orders', methods=['POST'])
def record_purchase_order():
    """F6.2: The system shall allow authenticated users to record new purchase orders."""
    data = request.get_json()
    required = ['skuid', 'supplier_id', 'order_quantity', 'expected_arrival_date']
    if not all(key in data for key in required):
        return jsonify({"error": f"Missing required fields: {', '.join(required)}"}), 400

    try:
        sku_id = uuid.UUID(data['skuid'])
        supplier_id = uuid.UUID(data['supplier_id'])
        order_quantity = int(data['order_quantity'])
        arrival_date = datetime.strptime(data['expected_arrival_date'], '%Y-%m-%d')
        
        if not SKU.objects(skuid=sku_id).count():
            return jsonify({"error": "Invalid SKU ID"}), 404
        if not Supplier.objects(supplier_id=supplier_id).count():
            return jsonify({"error": "Invalid Supplier ID"}), 404
        
        new_order = PurchaseOrder(
            skuid=sku_id,
            supplier_id=supplier_id,
            order_quantity=order_quantity,
            expected_arrival_date=arrival_date,
            order_status="Pending" 
        )
        new_order.save()
        return jsonify({
            "message": "Purchase Order recorded successfully",
            "order_id": str(new_order.purchase_order_id),
            "status": new_order.order_status
        }), 201
    except (ValueError, TypeError):
        return jsonify({"error": "Invalid format for IDs, quantity, or arrival date (use YYYY-MM-DD)."}), 400
    except ValidationError as e:
        return jsonify({"error": str(e)}), 400

@app.route('/api/orders/pending', methods=['GET'])
def list_pending_orders():
    """F6.5: The system shall display a list of pending purchase orders."""
    pending_orders = PurchaseOrder.objects(order_status="Pending").order_by('expected_arrival_date')
    
    order_list = [{
        "order_id": str(o.purchase_order_id),
        "sku_id": str(o.skuid),
        "order_quantity": o.order_quantity,
        "expected_arrival": o.expected_arrival_date.strftime('%Y-%m-%d'),
        "status": o.order_status
    } for o in pending_orders]
    
    return jsonify(order_list), 200

@app.route('/api/orders/<order_id>/receive', methods=['PATCH'])
def receive_purchase_order(order_id):
    """
    F6.3: Mark purchase order as 'Received'.
    F6.4: Automatically update stock level upwards.
    """
    try:
        order = PurchaseOrder.objects.get(purchase_order_id=uuid.UUID(order_id))
        
        if order.order_status == "Received":
            return jsonify({"message": "Order already marked as received."}), 200

        # 1. Update SKU stock level (F6.4)
        sku = SKU.objects.get(skuid=order.skuid)
        sku.current_stock_level += order.order_quantity 
        sku.save()
        
        # 2. Update order status (F6.3)
        order.order_status = "Received"
        order.save()
        
        return jsonify({
            "message": f"Order {order_id} received. Stock for {sku.sku_name} updated.",
            "new_stock_level": sku.current_stock_level
        }), 200
    except DoesNotExist:
        return jsonify({"error": "Purchase Order or linked SKU not found."}), 404
    except Exception as e:
        return jsonify({"error": f"An internal error occurred: {e}"}), 500

@app.route('/api/orders/alerts', methods=['GET'])
def check_overdue_orders():
    """F6.6: Generate an alert for authenticated users when a PO's expected arrival date has passed."""
    
    overdue_orders = PurchaseOrder.objects(
        order_status="Pending",
        expected_arrival_date__lt=datetime.now(timezone.utc) # Use timezone-aware now
    ).order_by('expected_arrival_date')
    
    alert_list = [{
        "order_id": str(o.purchase_order_id),
        "sku_id": str(o.skuid),
        "expected_arrival": o.expected_arrival_date.strftime('%Y-%m-%d'),
        "days_overdue": (datetime.now(timezone.utc) - o.expected_arrival_date).days
    } for o in overdue_orders]
    
    return jsonify({
        "alert_count": len(alert_list),
        "overdue_orders": alert_list
    }), 200


# ==============================================================================
# 3.2.7 F7: "What If" Scenario Analysis Endpoint (INCREMENT 5)
# ==============================================================================

@app.route('/api/skus/<sku_id>/whatif', methods=['POST'])
def analyze_what_if_scenario(sku_id):
    """
    F7.1-F7.3: Allows users to input hypothetical scenarios and retrieves AI-generated analysis.
    """
    if not gemini_client:
        return jsonify({"error": "AI service temporarily unavailable."}), 503 

    data = request.get_json()
    scenario_description = data.get('scenario_description') # F7.1
    
    if not scenario_description:
         return jsonify({"error": "Missing required field: scenario_description."}), 400

    try:
        sku, raw_sales = get_sales_data_for_analysis(sku_id)
        current_stock = sku.current_stock_level
        
        sales_trend_data = calculate_sales_trends(raw_sales, period='W') 
        average_weekly_sales = sales_trend_data['average_sales_per_period']
        
        # F7.2: Construct the Scenario Analysis Prompt
        system_prompt = (
            "You are StockWise AI, a strategic planning consultant. Your task is to analyze a hypothetical "
            "business scenario and provide a detailed, plain-language analysis of the likely impact on the product's demand, "
            "reorder points, and overall inventory strategy. Focus on quantifying the potential change where possible. "
            "The output MUST be a strategic report, starting with the heading 'Scenario Analysis Report:'."
        )

        user_prompt = f"""
        SKU Name: {sku.sku_name}
        SKU Description: {sku.sku_description}
        Current Stock Level: {current_stock} units
        Current Average Weekly Demand: {average_weekly_sales} units
        
        Hypothetical Scenario to Analyze (F7.1): "{scenario_description}"

        Task (F7.3): Analyze the scenario. Specifically, provide the following:
        1. A prediction of how the Average Weekly Demand might change (e.g., "Demand would increase by 30%").
        2. A qualitative assessment of the inventory risk (e.g., "High risk of stockout").
        3. Suggested action steps for the inventory manager.
        """
        
        response = gemini_client.models.generate_content(
            model=GEMINI_MODEL,
            contents=[system_prompt, user_prompt],
        )

        # F7.3: Return the AI-generated analysis
        new_log = AIHistory(
            skuid=uuid.UUID(sku_id),
            insight_type='Scenario',
            ai_output=response.text.strip(),
            input_params={
                "scenario": scenario_description,
                "current_stock": current_stock,
                "average_weekly_sales": average_weekly_sales
            }
        )
        new_log.save()
        
        return jsonify({
            "sku_id": sku_id,
            "scenario": scenario_description,
            "ai_analysis": response.text.strip() 
        }), 200

    except DoesNotExist:
        return jsonify({"error": "SKU not found"}), 404
    except APIError as e:
        return jsonify({"error": f"LLM API Error: {e}"}), 500
    except Exception as e:
        return jsonify({"error": f"An internal error occurred: {e}"}), 500


# ==============================================================================
# 3.2.8 F8: Inventory Audit Dashboard & Reporting Endpoints (INCREMENT 5)
# ==============================================================================

@app.route('/api/dashboard/metrics', methods=['GET'])
def get_dashboard_metrics():
    """
    F8.1: Provides an inventory dashboard displaying key metrics.
    """
    # Call the pure data helper function
    metrics = calculate_metrics() 
    
    # Return the dictionary wrapped in a Flask JSON response
    return jsonify(metrics), 200


@app.route('/api/reports/summary', methods=['GET'])
def generate_summary_report():
    """
    F8.2 & F8.3: Generates a summary report of inventory performance and allows export (F8.3).
    """
    
    # F8.2: Get high-level metrics by calling the helper function directly
    metrics = calculate_metrics() 

    # F8.2: Summarize Al recommendations 
    report_text = metrics.pop("last_ai_recommendation_raw", "No recent AI summary available.")
    
    # We reconstruct the summary using the metrics calculated in the helper
    summary_report_text = f"""
    STOCKWISE AI INVENTORY SUMMARY REPORT
    Generated Date: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')} UTC
    
    --- INVENTORY OVERVIEW ---
    Total Active Products (SKUs): {metrics['total_active_skus']}
    Total Units in Stock: {metrics['total_stock_count']}
    Estimated Inventory Value: ${metrics['total_inventory_value_estimated']}
    Low Stock Alerts (below {metrics['low_stock_threshold_units']} units): {metrics['low_stock_items_count']}
    
    --- SALES PERFORMANCE ---
    Total Sales Revenue Recorded: ${metrics['total_sales_revenue']}
    
    --- AI RECOMMENDATION SUMMARY ---
    The last major AI insight was: {report_text}
    """
    
    # F8.3: Handle Export Request (CSV logic)
    export_format = request.args.get('format', 'text').lower()
    
    if export_format == 'csv':
        # Simple CSV format (F8.3)
        csv_data = "Metric,Value\n"
        for key, value in metrics.items():
            csv_data += f"{key},{value}\n"
        
        # This is how Flask returns a file download
        response = make_response(csv_data)
        response.headers["Content-Disposition"] = "attachment; filename=stockwise_report.csv"
        response.headers["Content-type"] = "text/csv"
        return response
    else:
        # Default text/JSON response
        return jsonify({
            "report_summary": summary_report_text,
            "metrics": metrics
        }), 200

if __name__ == '__main__':
    app.run(debug=True)