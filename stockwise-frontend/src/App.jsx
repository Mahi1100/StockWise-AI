// stockwise-frontend/src/App.jsx

import { useState } from 'react';
// Import stable components from react-bootstrap
import { Container, Row, Col, Card, Nav, Button, Spinner, Table, Form, InputGroup, Alert, Modal, Tabs, Tab } from 'react-bootstrap'; 

import { FiHome, FiPackage, FiZap, FiSettings, FiBarChart, FiSearch, FiPlus, FiEdit, FiSave, FiTrendingUp, FiAlertTriangle, FiRefreshCw, FiDownload, FiDollarSign } from 'react-icons/fi';
import { useMetrics } from './hooks/useMetrics'; 
import { useSalesData } from './hooks/useSalesData'; 
import { useSKUManager } from './hooks/useSKUManager'; 
import { useAIManager } from './hooks/useAIManager'; 
import { useReportManager } from './hooks/useReportManager'; 

// Charting imports (needed for DashboardView)
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, } from 'chart.js';

// Register the chart components (CRITICAL for Chart.js)
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);


// --- COLOR TOKENS (For Readability) ---
const PRIMARY_COLOR = '#0d6efd'; 
const DARK_BG_COLOR = '#0551b8'; 
const LIGHT_BG_COLOR = '#f8f9fa'; 
const CARD_BG_COLOR = 'white';

// Simple Navigation Item Component
const NavItem = ({ icon: Icon, children, active, onClick }) => (
  <Nav.Link 
    onClick={onClick}
    className={`d-flex align-items-center rounded-lg mx-3 p-2 my-1 
                ${active ? 'bg-primary text-white' : 'text-secondary'} 
                ${active ? 'fw-bold' : ''}`}
    style={{ transition: 'background-color 0.2s' }}
  >
    <Icon size={18} className="me-3" />
    {children}
  </Nav.Link>
);

// Component for the Metric Cards (F8.1)
const MetricCard = ({ title, value, unit = '', color = 'text-dark' }) => (
  <Card className="shadow-sm border-0" style={{ minHeight: '120px' }}>
    <Card.Body>
        <p className="text-muted mb-1" style={{ fontSize: '0.85rem' }}>{title}</p>
        <div className="d-flex align-items-baseline">
            <h1 className={`mb-0 fw-bolder ${color}`}>{value.toLocaleString()}</h1>
            <span className="ms-2 text-muted">{unit}</span>
        </div>
    </Card.Body>
  </Card>
);

// --- SALES RECORDING HOOK (F2.1) ---
const recordSale = async (formData) => {
    try {
        const response = await fetch('/api/sales', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || `Failed to record sale. Status: ${response.status}`);
        }
        return true;
    } catch (err) {
        alert(`Sale Recording Error: ${err.message}`);
        return false;
    }
};


// --- MODAL FOR RECORDING A NEW SALE (F2.1) ---
function RecordSaleModal({ show, handleClose, selectedSku, refreshSkus, refreshMetrics }) {
    // Current date in YYYY-MM-DD format (Backend expects this format)
    const today = new Date().toISOString().slice(0, 10); 
    
    const [formData, setFormData] = useState({
        //skuid: selectedSku ? selectedSku.skuid : '',
        quantity_sold: 1,
        selling_price: 0.00,
        sale_date: today,
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState(null);

    // Reset form data when SKU changes or modal is shown
    useState(() => {
        if (selectedSku) {
            setFormData(prev => ({
                ...prev, 
                skuid: selectedSku.skuid,
                selling_price: 0.00,
                sale_date: today, // Reset date to ensure correct format
            }));
        }
    }, [selectedSku, show]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        
        let processedValue = value;

        // CRITICAL FIX: Use conditional check and safe fallback
        if (name === 'quantity_sold') {
            // Convert to integer. If parsing fails (is NaN), default to 0.
            processedValue = parseInt(value) || 0; 
        } else if (name === 'selling_price') {
            // Convert to float. If parsing fails, default to 0.00.
            processedValue = parseFloat(value) || 0.00;
        } else if (name === 'sale_date') {
            // Ensure date field is not sent if empty
            processedValue = value || new Date().toISOString().slice(0, 10);
        }

        setFormData(prev => ({ ...prev, [name]: processedValue }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError(null);
        const salePayload = {
            skuid: selectedSku?.skuid, // Read clean ID directly from props
            quantity_sold: formData.quantity_sold,
            selling_price: formData.selling_price,
            sale_date: formData.sale_date,
        };
        
        // --- Execute Validation Check ---
        if (!salePayload.skuid || salePayload.skuid.length < 30) {
            // This validation check is now correctly triggered if the prop itself is bad.
            setError("Error: SKU ID prop is corrupt. Please re-select the SKU.");
            setIsSubmitting(false);
            return;
        }
        
        // Client-side validation checks
        if (salePayload.quantity_sold <= 0 || salePayload.selling_price <= 0) {
            setError("Quantity and Price must be greater than zero.");
            setIsSubmitting(false);
            return;
        }

        // --- Execute Backend Call ---
        const success = await recordSale(salePayload);
        
        if (success) {
            alert(`Sale recorded successfully! Stock updated.`);
            // Refresh parent components (SKU list and Dashboard metrics)
            refreshSkus();
            refreshMetrics();
            handleClose();
        } else {
            // Error handling from backend (like insufficient stock)
            setError('Please check the input values and current stock level.');
        }
        setIsSubmitting(false);
    };

    return (
        <Modal show={show} onHide={handleClose}>
            <Modal.Header closeButton>
                <Modal.Title><FiDollarSign className="me-2" /> Record New Sale (F2.1)</Modal.Title>
            </Modal.Header>
            <Form onSubmit={handleSubmit}>
                <Modal.Body>
                    {error && <Alert variant="danger">{error}</Alert>}
                    
                    <Form.Group className="mb-3">
                        <Form.Label>Product (SKU)</Form.Label>
                        <Form.Control type="text" value={selectedSku?.sku_name || 'Error: No SKU Selected'} disabled />
                        <Form.Text className="text-muted">SKU ID: {selectedSku?.skuid?.substring(0, 8)}...</Form.Text>
                    </Form.Group>

                    <Form.Group className="mb-3">
                        <Form.Label>Quantity Sold*</Form.Label>
                        <Form.Control type="number" name="quantity_sold" value={formData.quantity_sold} onChange={handleChange} min="1" required />
                        <Form.Text className="text-muted">Current Stock: {selectedSku?.current_stock_level}</Form.Text>
                    </Form.Group>
                    
                    <Form.Group className="mb-3">
                        <Form.Label>Selling Price*</Form.Label>
                        <InputGroup>
                            <InputGroup.Text>$</InputGroup.Text>
                            <Form.Control type="number" step="0.01" name="selling_price" value={formData.selling_price} onChange={handleChange} min="0.01" required />
                        </InputGroup>
                    </Form.Group>

                    <Form.Group className="mb-3">
                        <Form.Label>Sale Date</Form.Label>
                        {/* The type="date" input ensures the value is sent as YYYY-MM-DD, which the backend needs. */}
                        <Form.Control type="date" name="sale_date" value={formData.sale_date} onChange={handleChange} max={today} required />
                    </Form.Group>
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={handleClose}>Cancel</Button>
                    <Button variant="success" type="submit" disabled={isSubmitting}>
                        {isSubmitting ? <Spinner size="sm" animation="border" /> : <FiSave className="me-2" />} Confirm Sale
                    </Button>
                </Modal.Footer>
            </Form>
        </Modal>
    );
}

// --- SKU Management View (F1.1 - F1.6) ---

// Modal for Adding a New SKU (F1.1)
function AddSKUModal({ show, handleClose, addSku, error }) {
    const [formData, setFormData] = useState({
        sku_name: '',
        sku_description: '',
        unit_of_measure: '',
        initial_stock_level: 0,
    });
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        const success = await addSku(formData);
        setIsSubmitting(false);
        
        if (success) {
            alert("SKU Added Successfully!");
            handleClose();
            // Reset form
            setFormData({
                sku_name: '',
                sku_description: '',
                unit_of_measure: '',
                initial_stock_level: 0,
            });
        }
    };

    return (
        <Modal show={show} onHide={handleClose}>
            <Modal.Header closeButton>
                <Modal.Title><FiPlus className="me-2" /> Add New SKU (F1.1)</Modal.Title>
            </Modal.Header>
            <Form onSubmit={handleSubmit}>
                <Modal.Body>
                    {error && <Alert variant="danger">{error}</Alert>}
                    <Form.Group className="mb-3">
                        <Form.Label>SKU Name*</Form.Label>
                        <Form.Control type="text" name="sku_name" value={formData.sku_name} onChange={handleChange} required />
                    </Form.Group>
                    <Form.Group className="mb-3">
                        <Form.Label>Description (Optional)</Form.Label>
                        <Form.Control as="textarea" rows={2} name="sku_description" value={formData.sku_description} onChange={handleChange} />
                    </Form.Group>
                    <Form.Group className="mb-3">
                        <Form.Label>Unit of Measure*</Form.Label>
                        <Form.Control type="text" name="unit_of_measure" value={formData.unit_of_measure} onChange={handleChange} required />
                    </Form.Group>
                    <Form.Group className="mb-3">
                        <Form.Label>Initial Stock Level</Form.Label>
                        <Form.Control type="number" name="initial_stock_level" value={formData.initial_stock_level} onChange={handleChange} min="0" />
                    </Form.Group>
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={handleClose}>Close</Button>
                    <Button variant="primary" type="submit" disabled={isSubmitting}>
                        {isSubmitting ? <Spinner size="sm" /> : <FiSave className="me-2" />} Save SKU
                    </Button>
                </Modal.Footer>
            </Form>
        </Modal>
    );
}


// Main SKU Management Component
function SKUManagementView() {
    const { skus, isLoading, error, fetchSkus, addSku, updateSkuStock } = useSKUManager();
    const { fetchMetrics } = useMetrics(); // Need to refresh dashboard metrics after a sale
    
    const [searchTerm, setSearchTerm] = useState('');
    const [showAddModal, setShowAddModal] = useState(false);
    
    // State for the new sales modal
    const [showSaleModal, setShowSaleModal] = useState(false);
    const [selectedSkuForSale, setSelectedSkuForSale] = useState(null);


    const handleSearch = (e) => {
        e.preventDefault();
        fetchSkus(searchTerm); // F1.6: Search SKUs
    };

    // Handler for opening the sale modal
    const handleRecordSale = (sku) => {
        setSelectedSkuForSale(sku);
        setShowSaleModal(true);
    };

    // Handler for Quick Stock Update (F1.4)
    const handleStockUpdate = async (skuId) => {
        const newStock = prompt("Enter new stock level (F1.4):");
        if (newStock !== null && !isNaN(newStock) && newStock >= 0) {
            const success = await updateSkuStock(skuId, newStock);
            if (!success) {
                alert("Failed to update stock. Check console for details.");
            }
        } else if (newStock !== null) {
            alert("Invalid stock level entered.");
        }
    };


    return (
        <Container fluid className="p-0">
            <h2 className="mb-4">Product Catalog (F1.2)</h2>

            <Row className="mb-3 g-3">
                <Col md={8}>
                    <Form onSubmit={handleSearch}>
                        <InputGroup>
                            <Form.Control
                                placeholder="Search by SKU Name or ID (F1.6)"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                            <Button variant="outline-primary" type="submit"><FiSearch /></Button>
                        </InputGroup>
                    </Form>
                </Col>
                <Col md={4} className="d-grid">
                    <Button variant="success" onClick={() => setShowAddModal(true)}>
                        <FiPlus className="me-2" /> Add New Product (F1.1)
                    </Button>
                </Col>
            </Row>

            <Card className="shadow-sm">
                <Card.Body>
                    {error && <Alert variant="danger">{error}</Alert>}
                    
                    {isLoading ? (
                         <div className="text-center p-5"><Spinner animation="border" variant="primary" /><p className="mt-3 text-muted">Loading...</p></div>
                    ) : (
                        <Table responsive hover className="mb-0">
                            <thead>
                                <tr>
                                    <th>SKU ID</th>
                                    <th>Name (F1.3)</th>
                                    <th>UoM</th>
                                    <th className="text-center">Stock Level (F1.4)</th>
                                    <th className="text-center">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {skus.length === 0 ? (
                                    <tr><td colSpan="5" className="text-center text-muted">No SKUs found.</td></tr>
                                ) : (
                                    skus.map((sku) => (
                                        <tr key={sku.skuid}>
                                            <td style={{ fontSize: '0.8rem' }}>{sku.skuid.substring(0, 8)}...</td>
                                            <td>{sku.sku_name}</td>
                                            <td>{sku.unit_of_measure}</td>
                                            <td className="text-center">
                                                <span className={`badge bg-${sku.current_stock_level <= 50 ? 'warning' : 'primary'}`}>
                                                    {sku.current_stock_level}
                                                </span>
                                            </td>
                                            <td className="text-center d-flex justify-content-around">
                                                {/* Button to trigger the Sale Modal (F2.1) */}
                                                <Button variant="success" size="sm" onClick={() => handleRecordSale(sku)} title="Record Sale (F2.1)">
                                                    <FiDollarSign size={14} /> Sale
                                                </Button>
                                                {/* Button for Stock Update (F1.4) */}
                                                <Button variant="outline-primary" size="sm" onClick={() => handleStockUpdate(sku.skuid)} title="Update Stock (F1.4)">
                                                    <FiEdit size={14} /> Stock
                                                </Button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </Table>
                    )}
                </Card.Body>
            </Card>
            {/* Modals are placed outside the card */}
            <AddSKUModal show={showAddModal} handleClose={() => setShowAddModal(false)} addSku={addSku} error={error} />
            <RecordSaleModal 
                show={showSaleModal} 
                handleClose={() => setShowSaleModal(false)} 
                selectedSku={selectedSkuForSale}
                refreshSkus={fetchSkus}
                refreshMetrics={fetchMetrics}
            />
        </Container>
    );
}

// --- AI Forecasting View (F4, F5, F7) ---

// Component for the Recommendation Tab (F5)
function ReorderRecommendationTab({ skus, fetchRecommendations }) {
    const [selectedSku, setSelectedSku] = useState('');
    const [leadTime, setLeadTime] = useState(7);
    const [safetyStock, setSafetyStock] = useState(50);
    const [recommendation, setRecommendation] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!selectedSku) {
            setError("Please select an SKU.");
            return;
        }
        setIsLoading(true);
        setError(null);
        
        const result = await fetchRecommendations(selectedSku, leadTime, safetyStock);
        
        if (result && result.ai_recommendation) {
            setRecommendation(result.ai_recommendation);
            setError(null);
        } else {
            setError(result.error || "Failed to get recommendation.");
            setRecommendation(null);
        }
        setIsLoading(false);
    };

    return (
        <Card className="shadow-sm p-4">
            <h5 className="mb-4">Optimal Reorder Strategy (F5)</h5>
            <Form onSubmit={handleSubmit}>
                <Row>
                    <Col md={6}>
                        <Form.Group className="mb-3">
                            <Form.Label>Select SKU</Form.Label>
                            <Form.Select onChange={(e) => setSelectedSku(e.target.value)} required>
                                <option value="">Choose...</option>
                                {skus.map(sku => (
                                    <option key={sku.skuid} value={sku.skuid}>{sku.sku_name}</option>
                                ))}
                            </Form.Select>
                        </Form.Group>
                    </Col>
                    <Col md={3}>
                        <Form.Group className="mb-3">
                            <Form.Label>Lead Time (Days)</Form.Label>
                            <Form.Control type="number" value={leadTime} onChange={(e) => setLeadTime(parseInt(e.target.value))} min="1" required />
                        </Form.Group>
                    </Col>
                    <Col md={3}>
                        <Form.Group className="mb-3">
                            <Form.Label>Safety Stock (Units)</Form.Label>
                            <Form.Control type="number" value={safetyStock} onChange={(e) => setSafetyStock(parseInt(e.target.value))} min="0" required />
                        </Form.Group>
                    </Col>
                </Row>
                <div className="d-grid mt-2">
                    <Button variant="primary" type="submit" disabled={isLoading || !selectedSku}>
                        {isLoading ? <Spinner size="sm" animation="border" className="me-2" /> : <FiTrendingUp className="me-2" />}
                        Generate Recommendation
                    </Button>
                </div>
            </Form>

            <h5 className="mt-5 mb-3">AI Actionable Insight</h5>
            <Card className={`p-4 ${error ? 'border-danger' : 'border-success'} bg-light`}>
                {isLoading && <p className="text-center text-muted">Analyzing sales data and calculating reorder strategy...</p>}
                {error && <Alert variant="danger" className="mb-0">{error}</Alert>}
                {recommendation && <p className="mb-0 fw-bold">{recommendation}</p>}
                {!recommendation && !isLoading && !error && (
                    <p className="text-muted mb-0">Select an SKU and generate the recommendation.</p>
                )}
            </Card>
        </Card>
    );
}

// Component for the Scenario Analysis Tab (F7)
function ScenarioAnalysisTab({ skus, fetchScenarioAnalysis }) {
    const [selectedSku, setSelectedSku] = useState('');
    const [scenario, setScenario] = useState('');
    const [analysis, setAnalysis] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!selectedSku || !scenario) {
            setError("Please select an SKU and provide a scenario description.");
            return;
        }
        setIsLoading(true);
        setError(null);
        
        const result = await fetchScenarioAnalysis(selectedSku, scenario);
        
        if (result && result.ai_analysis) {
            setAnalysis(result.ai_analysis);
            setError(null);
        } else {
            setError(result.error || "Failed to get scenario analysis.");
            setAnalysis(null);
        }
        setIsLoading(false);
    };

    return (
        <Card className="shadow-sm p-4">
            <h5 className="mb-4">"What If" Strategic Planning (F7)</h5>
            <Form onSubmit={handleSubmit}>
                <Row>
                    <Col md={6}>
                        <Form.Group className="mb-3">
                            <Form.Label>Select SKU</Form.Label>
                            <Form.Select onChange={(e) => setSelectedSku(e.target.value)} required>
                                <option value="">Choose...</option>
                                {skus.map(sku => (
                                    <option key={sku.skuid} value={sku.skuid}>{sku.sku_name}</option>
                                ))}
                            </Form.Select>
                        </Form.Group>
                    </Col>
                </Row>
                <Form.Group className="mb-3">
                    <Form.Label>Hypothetical Scenario (F7.1)</Form.Label>
                    <Form.Control 
                        as="textarea" 
                        rows={3} 
                        placeholder="e.g., Sales increase by 50% for 6 weeks, OR: A major supplier has doubled their lead time."
                        value={scenario}
                        onChange={(e) => setScenario(e.target.value)}
                        required
                    />
                </Form.Group>
                <div className="d-grid mt-2">
                    <Button variant="danger" type="submit" disabled={isLoading || !selectedSku || !scenario}>
                        {isLoading ? <Spinner size="sm" animation="border" className="me-2" /> : <FiAlertTriangle className="me-2" />}
                        Analyze Scenario
                    </Button>
                </div>
            </Form>

            <h5 className="mt-5 mb-3">AI Strategic Analysis Report</h5>
            <Card className={`p-4 bg-light`}>
                {isLoading && <p className="text-center text-muted">Generating strategic analysis report...</p>}
                {error && <Alert variant="danger" className="mb-0">{error}</Alert>}
                {analysis && <p className="mb-0 text-dark" style={{ whiteSpace: 'pre-wrap' }}>{analysis}</p>}
                {!analysis && !isLoading && !error && (
                    <p className="text-muted mb-0">Analyze a scenario to generate a strategic report.</p>
                )}
            </Card>
        </Card>
    );
}


function AIForecastingView() {
    const { skus, isLoading: isSkuLoading, error: skuError } = useSKUManager();
    const { fetchRecommendations, fetchScenarioAnalysis } = useAIManager(); 

    if (isSkuLoading) {
        return <p className="text-center"><Spinner animation="border" /> Loading SKUs...</p>;
    }

    if (skuError) {
        return <Alert variant="danger">Error loading SKUs: {skuError}</Alert>;
    }
    
    // Fallback if no SKUs exist
    if (skus.length === 0) {
        return <Alert variant="info">No products found. Please add an SKU in the **SKU Management** view before using AI tools.</Alert>;
    }

    return (
        <Container fluid className="p-0">
            <Tabs defaultActiveKey="recommendation" className="mb-3">
                <Tab eventKey="recommendation" title="Reorder Recommendation (F5)">
                    <ReorderRecommendationTab 
                        skus={skus} 
                        fetchRecommendations={fetchRecommendations} 
                    />
                </Tab>
                <Tab eventKey="scenario" title="What If Analysis (F7)">
                     <ScenarioAnalysisTab 
                        skus={skus} 
                        fetchScenarioAnalysis={fetchScenarioAnalysis}
                    />
                </Tab>
            </Tabs>
        </Container>
    );
}

// --- Audit and Reports View (F8) ---

function AuditReportsView() {
    const { report, metrics, isLoading, error, fetchReport, downloadReport } = useReportManager();

    if (isLoading) {
        return <div className="text-center p-5"><Spinner animation="border" variant="primary" /><p className="mt-3 text-muted">Loading Report Data...</p></div>;
    }

    if (error) {
        return <Alert variant="danger">Error loading report: {error}</Alert>;
    }

    // FINAL SAFETY CHECK: If metrics object is empty or report text is missing, show alert.
    if (Object.keys(metrics).length === 0 || !report.report_summary) {
         return <Alert variant="info">Report data is currently empty. Please ensure SKUs and Sales data exist in the system and try refreshing the page.</Alert>;
    }
    
    // Prepare metrics data for the table display
    const metricKeys = Object.keys(metrics).filter(key => key !== 'low_stock_threshold_units');
    
    return (
        <Container fluid className="p-0">
            <Row className="g-4">
                <Col xs={12}>
                    <div className="d-flex justify-content-between align-items-center mb-3">
                        <h2>Audit Summary (F8.2)</h2>
                        <Button variant="outline-primary" onClick={() => downloadReport('csv')}>
                            <FiDownload className="me-2" /> Export Report (CSV - F8.3)
                        </Button>
                    </div>
                    <Card className="shadow-sm">
                        <Card.Body>
                            <h5 className="card-title text-primary">High-Level Metrics (F8.1)</h5>
                            <Table striped bordered hover size="sm" className="mb-4">
                                <tbody>
                                    {metricKeys.map(key => (
                                        <tr key={key}>
                                            <td className="fw-bold">{key.replace(/_/g, ' ').toUpperCase()}</td>
                                            <td>{metrics[key].toLocaleString()} {key.includes('value') || key.includes('revenue') ? 'USD' : ''}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </Table>
                            <h5 className="card-title text-primary">AI & Operational Summary (F8.2)</h5>
                            <Card className="bg-light p-3">
                                <p style={{ whiteSpace: 'pre-wrap', fontSize: '0.9rem' }}>{report.report_summary}</p>
                            </Card>
                        </Card.Body>
                    </Card>
                </Col>
            </Row>
        </Container>
    );
}

// --- DASHBOARD VIEW (F3.1, F8.1) ---
const DashboardView = () => {
    // Hooks to fetch data
    const { metrics, isLoading: isMetricsLoading, error: metricsError } = useMetrics();
    const { salesData, isLoading: isSalesLoading, error: salesError } = useSalesData(); 

    if (isMetricsLoading || isSalesLoading) {
        return <div className="text-center"><div className="spinner-border text-primary" role="status"><span className="visually-hidden">Loading...</span></div></div>;
    }

    if (metricsError || salesError) {
        return <h2 className="text-danger fw-bold">Error: {metricsError || salesError}</h2>;
    }

    const lowStockColor = metrics.low_stock_items_count > 0 ? "text-danger" : "text-success";

    // --- Chart Data Preparation (F3.1) ---
    const chartLabels = salesData.map(d => d.period_end);
    const chartValues = salesData.map(d => d.quantity_sold);

    const data = {
        labels: chartLabels,
        datasets: [
            {
                label: 'Units Sold (Weekly Aggregation)',
                data: chartValues,
                borderColor: PRIMARY_COLOR,
                backgroundColor: 'rgba(13, 109, 253, 0.2)',
                tension: 0.2 
            },
        ],
    };

    const options = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { position: 'top' },
            title: { display: true, text: 'Historical Weekly Sales Trends' },
        },
    };

    return (
      <Container fluid className="p-0">
        <Row className="g-4">
          
          {/* Metric Cards (F8.1) */}
          <Col md={4}><MetricCard title="Total Active SKUs" value={metrics.total_active_skus} /></Col>
          <Col md={4}><MetricCard title="Total Stock Units" value={metrics.total_stock_count} /></Col>
          <Col md={4}><MetricCard title="Est. Inventory Value" value={metrics.total_inventory_value_estimated} unit="USD" /></Col>
          
          {/* Alerts and Performance */}
          <Col md={6}>
            <MetricCard 
                title="Low Stock Alerts" 
                value={metrics.low_stock_items_count} 
                color={lowStockColor}
            />
          </Col>
          <Col md={6}><MetricCard title="Total Sales Revenue" value={metrics.total_sales_revenue} unit="USD" /></Col>

          {/* AI Recommendation Card (F4/F5) */}
          <Col xs={12}>
            <Card className="shadow-lg border-0 bg-primary text-white p-2">
              <Card.Body>
                <h5 className="card-title">Latest AI Recommendation (F5.3)</h5>
                <p className="fs-5">
                    The core intelligence is running. Connect the **Reorder Recommendation** endpoint to see real-time advice!
                </p>
                <p className="mt-3 mb-0" style={{ fontSize: '0.9rem', opacity: '0.8' }}>
                    Current Stock: **{metrics.total_stock_count}** units. Low Stock Threshold: **{metrics.low_stock_threshold_units}**
                </p>
              </Card.Body>
            </Card>
          </Col>

          {/* Sales Chart (F3.1) */}
          <Col xs={12}>
            <Card className="shadow-lg p-4">
              <Card.Body>
                <h5 className="card-title mb-3">Historical Sales Trends (F3.1)</h5>
                {salesData.length > 0 ? (
                    <div style={{ height: '400px', width: '100%' }}>
                        <Line data={data} options={options} />
                    </div>
                ) : (
                    <p className="text-muted">No historical sales data available to chart.</p>
                )}
              </Card.Body>
            </Card>
          </Col>
          
        </Row>
      </Container>
    );
};


// Sidebar Component
const SidebarContent = ({ setActiveView, activeView }) => (
  <div 
    className="bg-white border-end shadow-sm" 
    style={{ width: '250px', position: 'fixed', height: '100vh', padding: '0' }}
  >
    <div className="d-flex align-items-center p-4">
      <h4 className="text-primary fw-bold mb-0">StockWise AI</h4>
    </div>
    <Nav className="flex-column">
      <NavItem icon={FiHome} onClick={() => setActiveView('Dashboard')} active={activeView === 'Dashboard'}>Dashboard</NavItem>
      <NavItem icon={FiPackage} onClick={() => setActiveView('SKU Management')} active={activeView === 'SKU Management'}>SKU Management</NavItem>
      <NavItem icon={FiZap} onClick={() => setActiveView('AI Forecasting')} active={activeView === 'AI Forecasting'}>AI Forecasting</NavItem>
      <NavItem icon={FiBarChart} onClick={() => setActiveView('Audit & Reports')} active={activeView === 'Audit & Reports'}>Audit & Reports</NavItem>
      <NavItem icon={FiSettings} onClick={() => setActiveView('Settings')} active={activeView === 'Settings'}>Settings</NavItem>
    </Nav>
  </div>
);

// Main Application Component
export default function App() {
  const [activeView, setActiveView] = useState('Audit & Reports'); // <-- Sets default view for easy debugging

  return (
    <div className="d-flex">
      <SidebarContent setActiveView={setActiveView} activeView={activeView} />
      <div 
        style={{ marginLeft: '250px', flexGrow: 1, minHeight: '100vh', backgroundColor: LIGHT_BG_COLOR }}
        className="p-4"
      >
        <div className="mb-4 mt-3">
            <h1 className="fw-bolder">{activeView}</h1>
            <p className="text-muted">Welcome back to the StockWise AI Framework.</p>
        </div>
        
        <div>
            {activeView === 'Dashboard' && <DashboardView />}
            {activeView === 'SKU Management' && <SKUManagementView />}
            {activeView === 'AI Forecasting' && <AIForecastingView />}
            {activeView === 'Audit & Reports' && <AuditReportsView />}
            {activeView === 'Settings' && <div className="p-4"><p>User Settings Coming Soon!</p></div>}
        </div>
      </div>
    </div>
  );
}