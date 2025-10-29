from mongoengine import Document, StringField, IntField, FloatField, DateTimeField, UUIDField, DictField, connect
from datetime import datetime
import uuid

# --- Data Model for SKUs (Stock Keeping Units) ---
# Traces to: F1.1-F1.6, SKUID, SKUName, SKUDescription, UnitOfMeasure, CurrentStockLevel
class SKU(Document):
    """
    Represents a Stock Keeping Unit (Product) in the inventory.
    """
    skuid = UUIDField(binary=False, required=True, default=uuid.uuid4, unique=True)
    sku_name = StringField(max_length=255, required=True)  # F1.1, F1.2, F1.3 
    sku_description = StringField(default="")             # F1.1, F1.3 
    unit_of_measure = StringField(max_length=50, default="pcs") # F1.1, F1.3 
    current_stock_level = IntField(min_value=0, default=0) # F1.1, F1.4 
    is_active = IntField(default=1) # Used for F1.5: Deactivate/Archive SKUs (1=Active, 0=Archived)

    meta = {'collection': 'skus'}


# --- Data Model for Sales Transactions ---
# Traces to: F2.1-F2.2, SaleID, SaleDate, QuantitySold, SellingPrice
class Sale(Document):
    """
    Records a sales transaction for a specific SKU.
    """
    sale_id = UUIDField(binary=False, required=True, default=uuid.uuid4, unique=True)
    skuid = UUIDField(binary=False, required=True)  # Links back to the SKU sold
    sale_date = DateTimeField(required=True, default=datetime.utcnow) # F2.1 
    quantity_sold = IntField(min_value=1, required=True)    # F2.1, F2.2 
    selling_price = FloatField(min_value=0, required=True)  # F2.1 

    meta = {
        'collection': 'sales',
        # Indexing for quick retrieval of sales history by SKU for F3 (later increment)
        'indexes': ['skuid', 'sale_date'] 
    }
# --- Data Model for Suppliers ---
# Traces to: F6.1, SupplierID, SupplierName
class Supplier(Document):
    """
    Represents a supplier for inventory items.
    """
    supplier_id = UUIDField(binary=False, required=True, default=uuid.uuid4, unique=True)
    supplier_name = StringField(max_length=255, required=True) # F6.1
    contact_info = StringField(max_length=500)
    notes = StringField()

    meta = {'collection': 'suppliers'}

# --- Data Model for Purchase Orders (PO) ---
# Traces to: F6.2 - F6.6, PurchaseOrderID, OrderQuantity, ExpectedArrivalDate, OrderStatus
class PurchaseOrder(Document):
    """
    Records an order placed with a supplier.
    """
    purchase_order_id = UUIDField(binary=False, required=True, default=uuid.uuid4, unique=True)
    skuid = UUIDField(binary=False, required=True)              # Which product is being ordered (F6.2)
    supplier_id = UUIDField(binary=False)                       # From which supplier (F6.2)
    order_quantity = IntField(min_value=1, required=True)       # OrderQuantity (F6.2)
    order_date = DateTimeField(required=True, default=datetime.utcnow)
    expected_arrival_date = DateTimeField(required=True)        # ExpectedArrivalDate (F6.2, F6.6)
    order_status = StringField(default="Pending", choices=("Pending", "Received", "Overdue")) # OrderStatus (F6.2, F6.3, F6.5)

    meta = {
        'collection': 'purchase_orders',
        'indexes': ['skuid', 'supplier_id', 'order_status'] 
    }
# models.py (Add this new class)

# --- Data Model for AI History/Logs ---
class AIHistory(Document):
    """
    Stores logs of AI-generated forecasts and recommendations.
    Traces to: U4 Postcondition, U5 Postcondition
    """
    log_id = UUIDField(binary=False, required=True, default=uuid.uuid4, unique=True)
    skuid = UUIDField(binary=False, required=True)
    # The type of insight generated
    insight_type = StringField(required=True, choices=('Forecast', 'Recommendation', 'Scenario')) 
    # The full plain-language output from the LLM
    ai_output = StringField(required=True) 
    # Store the input parameters used for generating the advice
    input_params = DictField()
    created_at = DateTimeField(required=True, default=datetime.utcnow)

    meta = {
        'collection': 'ai_history',
        'indexes': ['skuid', 'created_at']
    }