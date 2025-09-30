// ========================================
// TRAJECTORY VIEWER - Main Application
// ========================================

// Three.js ES Module imports
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Embedded sample data - 4 variants with different noise/delay configurations
import { 
    SAMPLE_REFERENCE_DATA, 
    SAMPLE_SENF_LOW_NOISE_LOW_DELAY,
    SAMPLE_SENF_HIGH_NOISE_LOW_DELAY,
    SAMPLE_SENF_LOW_NOISE_HIGH_DELAY,
    SAMPLE_SENF_HIGH_NOISE_HIGH_DELAY
} from './sample-data.js';

// Constants
const R_EARTH = 6378137.0;

// State
let refData = null;
let testData = null;
let charts = {};
let threeScene = null;
let modalChart = null;
let currentModalChartName = null;

// Zoom history for undo functionality
const zoomHistory = {
    attitude: [],
    velocity: [],
    error: [],
    modal: []
};

// Common zoom/pan plugin options for all charts
// - Left mouse drag: Select horizontal range to zoom
// - Middle mouse drag: Pan
// - Scroll wheel: Zoom both axes
const zoomPanOptions = {
    pan: {
        enabled: true,
        mode: 'xy',
        threshold: 5,
        // Middle mouse button (button 1) for panning
        onPanStart: function({ chart, event }) {
            // Only allow pan with middle mouse button
            if (event.button !== 1) return false;
            return true;
        }
    },
    zoom: {
        wheel: {
            enabled: true,
            speed: 0.1,
        },
        pinch: {
            enabled: true
        },
        drag: {
            enabled: true,
            backgroundColor: 'rgba(99, 102, 241, 0.2)',
            borderColor: 'rgba(99, 102, 241, 0.8)',
            borderWidth: 1,
            threshold: 10
        },
        mode: 'x', // Horizontal zoom only for drag selection
        onZoomStart: function({ chart, event }) {
            // Save current zoom state for undo
            const chartName = getChartName(chart);
            if (chartName) {
                saveZoomState(chartName, chart);
            }
            return true;
        }
    },
    limits: {
        x: { min: 'original', max: 'original' },
        y: { min: 'original', max: 'original', minRange: 0.1 }
    }
};

// Helper to get chart name from chart instance
function getChartName(chart) {
    for (const [name, c] of Object.entries(charts)) {
        if (c === chart) return name;
    }
    if (chart === modalChart) return 'modal';
    return null;
}

// Save zoom state for undo
function saveZoomState(chartName, chart) {
    const state = {
        x: { min: chart.scales.x.min, max: chart.scales.x.max },
        y: { min: chart.scales.y.min, max: chart.scales.y.max }
    };
    if (!zoomHistory[chartName]) zoomHistory[chartName] = [];
    zoomHistory[chartName].push(state);
    // Keep max 20 history entries
    if (zoomHistory[chartName].length > 20) {
        zoomHistory[chartName].shift();
    }
}

// Undo last zoom
function undoZoom(chartName) {
    const chart = chartName === 'modal' ? modalChart : charts[chartName];
    if (!chart || !zoomHistory[chartName] || zoomHistory[chartName].length === 0) {
        return false;
    }
    
    const prevState = zoomHistory[chartName].pop();
    chart.zoomScale('x', { min: prevState.x.min, max: prevState.x.max }, 'none');
    chart.zoomScale('y', { min: prevState.y.min, max: prevState.y.max }, 'none');
    chart.update('none');
    return true;
}

// ========================================
// DATA PARSING
// ========================================
function parseTrajectoryFile(content) {
    const lines = content.trim().split('\n');
    const dataLines = lines.slice(1); // Skip header
    
    const data = {
        time: [], lat: [], lon: [], alt: [],
        vn: [], ve: [], vd: [],
        qw: [], qx: [], qy: [], qz: [],
        bx: [], by: [], bz: [],
        gx: [], gy: [], gz: []
    };
    
    dataLines.forEach(line => {
        const values = line.trim().split(/\s+/).map(parseFloat);
        if (values.length >= 17) {
            data.time.push(values[0]);
            data.lat.push(values[1]);
            data.lon.push(values[2]);
            data.alt.push(values[3]);
            data.vn.push(values[4]);
            data.ve.push(values[5]);
            data.vd.push(values[6]);
            data.qw.push(values[7]);
            data.qx.push(values[8]);
            data.qy.push(values[9]);
            data.qz.push(values[10]);
            data.bx.push(values[11]);
            data.by.push(values[12]);
            data.bz.push(values[13]);
            data.gx.push(values[14]);
            data.gy.push(values[15]);
            data.gz.push(values[16]);
        }
    });
    
    return data;
}

// ========================================
// MATH UTILITIES
// ========================================
function quaternionToEuler(qw, qx, qy, qz) {
    const rolls = [], pitches = [], yaws = [];
    
    for (let i = 0; i < qw.length; i++) {
        const sinr_cosp = 2 * (qw[i] * qx[i] + qy[i] * qz[i]);
        const cosr_cosp = 1 - 2 * (qx[i] * qx[i] + qy[i] * qy[i]);
        const roll = Math.atan2(sinr_cosp, cosr_cosp);
        
        const sinp = 2 * (qw[i] * qy[i] - qz[i] * qx[i]);
        const pitch = Math.abs(sinp) >= 1 ? Math.sign(sinp) * Math.PI / 2 : Math.asin(sinp);
        
        const siny_cosp = 2 * (qw[i] * qz[i] + qx[i] * qy[i]);
        const cosy_cosp = 1 - 2 * (qy[i] * qy[i] + qz[i] * qz[i]);
        const yaw = Math.atan2(siny_cosp, cosy_cosp);
        
        rolls.push(roll * 180 / Math.PI);
        pitches.push(pitch * 180 / Math.PI);
        yaws.push(yaw * 180 / Math.PI);
    }
    
    return { roll: rolls, pitch: pitches, yaw: yaws };
}

function convertToNED(lat, lon, alt, lat0, lon0, alt0) {
    const north = [], east = [], down = [];
    
    for (let i = 0; i < lat.length; i++) {
        north.push((lat[i] - lat0) * R_EARTH);
        east.push((lon[i] - lon0) * R_EARTH * Math.cos(lat0));
        down.push(-(alt[i] - alt0));
    }
    
    return { north, east, down };
}

function computePositionError(ref, test) {
    const n = Math.min(ref.lat.length, test.lat.length);
    const errors = { north: [], east: [], down: [], horizontal: [], error3d: [] };
    
    for (let i = 0; i < n; i++) {
        const ne = (test.lat[i] - ref.lat[i]) * R_EARTH;
        const ee = (test.lon[i] - ref.lon[i]) * R_EARTH * Math.cos(ref.lat[i]);
        const de = test.alt[i] - ref.alt[i];
        const he = Math.sqrt(ne * ne + ee * ee);
        const e3d = Math.sqrt(ne * ne + ee * ee + de * de);
        
        errors.north.push(ne);
        errors.east.push(ee);
        errors.down.push(de);
        errors.horizontal.push(he);
        errors.error3d.push(e3d);
    }
    
    return errors;
}

function arrayStats(arr) {
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    const min = Math.min(...arr);
    const max = Math.max(...arr);
    const std = Math.sqrt(arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length);
    return { mean, min, max, std };
}

// ========================================
// TRAJECTORY ANALYSIS
// ========================================
function analyzeTrajectory(data) {
    const n = data.time.length;
    const duration = data.time[n - 1] - data.time[0];
    
    // Speed calculation
    const speed = data.vn.map((_, i) => 
        Math.sqrt(data.vn[i] ** 2 + data.ve[i] ** 2 + data.vd[i] ** 2)
    );
    const speedStats = arrayStats(speed);
    
    // Quaternion norm
    const quatNorm = data.qw.map((_, i) =>
        Math.sqrt(data.qw[i] ** 2 + data.qx[i] ** 2 + data.qy[i] ** 2 + data.qz[i] ** 2)
    );
    const quatStats = arrayStats(quatNorm);
    
    // Position drift
    const latDrift = (data.lat[n - 1] - data.lat[0]) * R_EARTH;
    const lonDrift = (data.lon[n - 1] - data.lon[0]) * R_EARTH * Math.cos(data.lat[0]);
    const altDrift = data.alt[n - 1] - data.alt[0];
    const totalDrift = Math.sqrt(latDrift ** 2 + lonDrift ** 2 + altDrift ** 2);
    
    // Physical checks
    const altReasonable = data.alt.every(a => a > -1000 && a < 50000);
    const speedReasonable = speedStats.max < 500;
    const quatNormalized = quatNorm.every(q => Math.abs(q - 1.0) < 0.01);
    
    return {
        samples: n,
        duration,
        initial: {
            lat: data.lat[0] * 180 / Math.PI,
            lon: data.lon[0] * 180 / Math.PI,
            alt: data.alt[0],
            vn: data.vn[0],
            ve: data.ve[0],
            vd: data.vd[0]
        },
        final: {
            lat: data.lat[n - 1] * 180 / Math.PI,
            lon: data.lon[n - 1] * 180 / Math.PI,
            alt: data.alt[n - 1],
            vn: data.vn[n - 1],
            ve: data.ve[n - 1],
            vd: data.vd[n - 1]
        },
        drift: {
            north: latDrift,
            east: lonDrift,
            alt: altDrift,
            total: totalDrift
        },
        speed: speedStats,
        checks: {
            altReasonable,
            speedReasonable,
            quatNormalized,
            altRange: [Math.min(...data.alt), Math.max(...data.alt)],
            maxSpeed: speedStats.max,
            quatRange: [quatStats.min, quatStats.max]
        }
    };
}

// ========================================
// UI RENDERING
// ========================================
function renderAnalysisCard(containerId, analysis, label) {
    const container = document.querySelector(`#${containerId} .card-body`);
    
    container.innerHTML = `
        <div class="analysis-content">
            <div class="stat-group">
                <div class="stat-group-title">Overview</div>
                <div class="stat-row">
                    <span class="stat-label">Samples</span>
                    <span class="stat-value">${analysis.samples.toLocaleString()}</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Duration</span>
                    <span class="stat-value">${analysis.duration.toFixed(2)} s</span>
                </div>
            </div>
            
            <div class="stat-group">
                <div class="stat-group-title">Initial State</div>
                <div class="stat-row">
                    <span class="stat-label">Position</span>
                    <span class="stat-value">${analysis.initial.lat.toFixed(6)}°, ${analysis.initial.lon.toFixed(6)}°</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Altitude</span>
                    <span class="stat-value highlight">${analysis.initial.alt.toFixed(2)} m</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Velocity (NED)</span>
                    <span class="stat-value">${analysis.initial.vn.toFixed(2)}, ${analysis.initial.ve.toFixed(2)}, ${analysis.initial.vd.toFixed(2)} m/s</span>
                </div>
            </div>
            
            <div class="stat-group">
                <div class="stat-group-title">Total Drift</div>
                <div class="stat-row">
                    <span class="stat-label">North</span>
                    <span class="stat-value">${(analysis.drift.north / 1000).toFixed(4)} km</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">East</span>
                    <span class="stat-value">${(analysis.drift.east / 1000).toFixed(4)} km</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Altitude</span>
                    <span class="stat-value">${(analysis.drift.alt / 1000).toFixed(4)} km</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Total 3D</span>
                    <span class="stat-value highlight">${(analysis.drift.total / 1000).toFixed(4)} km</span>
                </div>
            </div>
            
            <div class="stat-group">
                <div class="stat-group-title">Physical Checks</div>
                <div class="check-list">
                    <div class="check-item">
                        <span class="check-icon ${analysis.checks.altReasonable ? 'pass' : 'fail'}">${analysis.checks.altReasonable ? '✓' : '✗'}</span>
                        <span>Altitude in [-1km, 50km]</span>
                        <span class="check-detail">${analysis.checks.altRange[0].toFixed(0)}m - ${analysis.checks.altRange[1].toFixed(0)}m</span>
                    </div>
                    <div class="check-item">
                        <span class="check-icon ${analysis.checks.speedReasonable ? 'pass' : 'fail'}">${analysis.checks.speedReasonable ? '✓' : '✗'}</span>
                        <span>Speed < 500 m/s</span>
                        <span class="check-detail">max: ${analysis.checks.maxSpeed.toFixed(1)} m/s</span>
                    </div>
                    <div class="check-item">
                        <span class="check-icon ${analysis.checks.quatNormalized ? 'pass' : 'fail'}">${analysis.checks.quatNormalized ? '✓' : '✗'}</span>
                        <span>Quaternion normalized</span>
                        <span class="check-detail">${analysis.checks.quatRange[0].toFixed(4)} - ${analysis.checks.quatRange[1].toFixed(4)}</span>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function renderComparisonCard(refAnalysis, testAnalysis) {
    const container = document.querySelector('#comparison-summary .card-body');
    const errors = computePositionError(refData, testData);
    const errorStats = {
        horizontal: arrayStats(errors.horizontal),
        error3d: arrayStats(errors.error3d)
    };
    
    container.innerHTML = `
        <div class="analysis-content">
            <div class="stat-group">
                <div class="stat-group-title">Sample Comparison</div>
                <div class="stat-row">
                    <span class="stat-label">Reference samples</span>
                    <span class="stat-value">${refAnalysis.samples.toLocaleString()}</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Test samples</span>
                    <span class="stat-value">${testAnalysis.samples.toLocaleString()}</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Common samples</span>
                    <span class="stat-value highlight">${Math.min(refAnalysis.samples, testAnalysis.samples).toLocaleString()}</span>
                </div>
            </div>
            
            <div class="stat-group">
                <div class="stat-group-title">Position Error</div>
                <div class="stat-row">
                    <span class="stat-label">Horizontal (mean)</span>
                    <span class="stat-value">${errorStats.horizontal.mean.toFixed(4)} m</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Horizontal (max)</span>
                    <span class="stat-value">${errorStats.horizontal.max.toFixed(4)} m</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">3D (mean)</span>
                    <span class="stat-value">${errorStats.error3d.mean.toFixed(4)} m</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">3D (max)</span>
                    <span class="stat-value highlight">${errorStats.error3d.max.toFixed(4)} m</span>
                </div>
            </div>
            
            <div class="stat-group">
                <div class="stat-group-title">Initial State Difference</div>
                <div class="stat-row">
                    <span class="stat-label">Position (lat)</span>
                    <span class="stat-value">${((testData.lat[0] - refData.lat[0]) * R_EARTH).toFixed(4)} m</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Position (lon)</span>
                    <span class="stat-value">${((testData.lon[0] - refData.lon[0]) * R_EARTH * Math.cos(refData.lat[0])).toFixed(4)} m</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Altitude</span>
                    <span class="stat-value">${(testData.alt[0] - refData.alt[0]).toFixed(4)} m</span>
                </div>
            </div>
        </div>
    `;
}

function renderVerdict(testAnalysis) {
    const container = document.querySelector('#verdict-card .card-body');
    const passed = testAnalysis.checks.altReasonable && 
                   testAnalysis.checks.speedReasonable && 
                   testAnalysis.checks.quatNormalized;
    
    let issues = [];
    if (!testAnalysis.checks.altReasonable) issues.push('Altitude out of bounds');
    if (!testAnalysis.checks.speedReasonable) issues.push(`Speed too high (max: ${testAnalysis.checks.maxSpeed.toFixed(1)} m/s)`);
    if (!testAnalysis.checks.quatNormalized) issues.push('Quaternion not normalized');
    
    container.innerHTML = `
        <div class="verdict-content">
            <div class="verdict-icon ${passed ? 'pass' : 'fail'}">${passed ? '🚀' : '⚠️'}</div>
            <h2 class="verdict-title ${passed ? 'pass' : 'fail'}">
                ${passed ? 'PHYSICALLY REASONABLE' : 'PHYSICALLY UNREASONABLE'}
            </h2>
            <p class="verdict-description">
                ${passed 
                    ? 'The SENF output shows reasonable behavior. Altitude stays within realistic bounds and velocity stays within reasonable limits.'
                    : `Issues detected: ${issues.join(', ')}`
                }
            </p>
        </div>
    `;
}

// ========================================
// CHARTS
// ========================================
function createAttitudeChart() {
    const ctx = document.getElementById('chart-attitude').getContext('2d');
    
    if (charts.attitude) charts.attitude.destroy();
    
    const refEuler = quaternionToEuler(refData.qw, refData.qx, refData.qy, refData.qz);
    const testEuler = quaternionToEuler(testData.qw, testData.qx, testData.qy, testData.qz);
    
    // Downsample for performance
    const step = Math.max(1, Math.floor(refData.time.length / 500));
    const labels = refData.time.filter((_, i) => i % step === 0);
    
    charts.attitude = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                { label: 'Ref Roll', data: refEuler.roll.filter((_, i) => i % step === 0), borderColor: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.1)', tension: 0.1, pointRadius: 0 },
                { label: 'SENF Roll', data: testEuler.roll.filter((_, i) => i % step === 0), borderColor: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)', tension: 0.1, pointRadius: 0 },
                { label: 'Ref Pitch', data: refEuler.pitch.filter((_, i) => i % step === 0), borderColor: '#22d3ee', backgroundColor: 'rgba(34, 211, 238, 0.1)', tension: 0.1, pointRadius: 0, hidden: true },
                { label: 'SENF Pitch', data: testEuler.pitch.filter((_, i) => i % step === 0), borderColor: '#f97316', backgroundColor: 'rgba(249, 115, 22, 0.1)', tension: 0.1, pointRadius: 0, hidden: true },
                { label: 'Ref Yaw', data: refEuler.yaw.filter((_, i) => i % step === 0), borderColor: '#a78bfa', backgroundColor: 'rgba(167, 139, 250, 0.1)', tension: 0.1, pointRadius: 0, hidden: true },
                { label: 'SENF Yaw', data: testEuler.yaw.filter((_, i) => i % step === 0), borderColor: '#facc15', backgroundColor: 'rgba(250, 204, 21, 0.1)', tension: 0.1, pointRadius: 0, hidden: true }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { labels: { color: '#94a3b8' } },
                zoom: zoomPanOptions,
                tooltip: {
                    backgroundColor: 'rgba(20, 20, 30, 0.9)',
                    titleColor: '#f8fafc',
                    bodyColor: '#94a3b8',
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderWidth: 1,
                    padding: 12,
                    displayColors: true
                }
            },
            scales: {
                x: { title: { display: true, text: 'Time [s]', color: '#94a3b8' }, ticks: { color: '#64748b', maxTicksLimit: 5, font: { size: 14 }, callback: v => Number(v).toPrecision(5) }, grid: { color: 'rgba(255,255,255,0.05)' } },
                y: { title: { display: true, text: 'Angle [deg]', color: '#94a3b8' }, ticks: { color: '#64748b' }, grid: { color: 'rgba(255,255,255,0.05)' } }
            }
        }
    });
}

function createVelocityChart() {
    const ctx = document.getElementById('chart-velocity').getContext('2d');
    
    if (charts.velocity) charts.velocity.destroy();
    
    const step = Math.max(1, Math.floor(refData.time.length / 500));
    const labels = refData.time.filter((_, i) => i % step === 0);
    
    charts.velocity = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                { label: 'Ref Vn', data: refData.vn.filter((_, i) => i % step === 0), borderColor: '#3b82f6', tension: 0.1, pointRadius: 0 },
                { label: 'SENF Vn', data: testData.vn.filter((_, i) => i % step === 0), borderColor: '#ef4444', tension: 0.1, pointRadius: 0 },
                { label: 'Ref Ve', data: refData.ve.filter((_, i) => i % step === 0), borderColor: '#22d3ee', tension: 0.1, pointRadius: 0, hidden: true },
                { label: 'SENF Ve', data: testData.ve.filter((_, i) => i % step === 0), borderColor: '#f97316', tension: 0.1, pointRadius: 0, hidden: true },
                { label: 'Ref Vd', data: refData.vd.filter((_, i) => i % step === 0), borderColor: '#a78bfa', tension: 0.1, pointRadius: 0, hidden: true },
                { label: 'SENF Vd', data: testData.vd.filter((_, i) => i % step === 0), borderColor: '#facc15', tension: 0.1, pointRadius: 0, hidden: true }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { labels: { color: '#94a3b8' } },
                zoom: zoomPanOptions,
                tooltip: {
                    backgroundColor: 'rgba(20, 20, 30, 0.9)',
                    titleColor: '#f8fafc',
                    bodyColor: '#94a3b8',
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderWidth: 1,
                    padding: 12,
                    displayColors: true
                }
            },
            scales: {
                x: { title: { display: true, text: 'Time [s]', color: '#94a3b8' }, ticks: { color: '#64748b', maxTicksLimit: 5, font: { size: 14 }, callback: v => Number(v).toPrecision(5) }, grid: { color: 'rgba(255,255,255,0.05)' } },
                y: { title: { display: true, text: 'Velocity [m/s]', color: '#94a3b8' }, ticks: { color: '#64748b' }, grid: { color: 'rgba(255,255,255,0.05)' } }
            }
        }
    });
}

function createErrorChart() {
    const ctx = document.getElementById('chart-error').getContext('2d');
    
    if (charts.error) charts.error.destroy();
    
    const errors = computePositionError(refData, testData);
    const n = Math.min(refData.time.length, testData.time.length);
    const step = Math.max(1, Math.floor(n / 500));
    const labels = refData.time.slice(0, n).filter((_, i) => i % step === 0);
    
    charts.error = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                { label: 'Horizontal Error', data: errors.horizontal.filter((_, i) => i % step === 0), borderColor: '#22d3ee', fill: true, backgroundColor: 'rgba(34, 211, 238, 0.1)', tension: 0.1, pointRadius: 0 },
                { label: '3D Error', data: errors.error3d.filter((_, i) => i % step === 0), borderColor: '#a78bfa', fill: true, backgroundColor: 'rgba(167, 139, 250, 0.1)', tension: 0.1, pointRadius: 0 },
                { label: 'Down Error', data: errors.down.filter((_, i) => i % step === 0), borderColor: '#4ade80', tension: 0.1, pointRadius: 0, hidden: true }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { labels: { color: '#94a3b8' } },
                zoom: zoomPanOptions,
                tooltip: {
                    backgroundColor: 'rgba(20, 20, 30, 0.9)',
                    titleColor: '#f8fafc',
                    bodyColor: '#94a3b8',
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderWidth: 1,
                    padding: 12,
                    displayColors: true
                }
            },
            scales: {
                x: { title: { display: true, text: 'Time [s]', color: '#94a3b8' }, ticks: { color: '#64748b', maxTicksLimit: 5, font: { size: 14 }, callback: v => Number(v).toPrecision(5) }, grid: { color: 'rgba(255,255,255,0.05)' } },
                y: { title: { display: true, text: 'Error [m]', color: '#94a3b8' }, ticks: { color: '#64748b' }, grid: { color: 'rgba(255,255,255,0.05)' } }
            }
        }
    });
}

function computeAoA(data) {
    const aoa = {
        absolute: [],
        pitch: [],
        yaw: []
    };
    
    for (let i = 0; i < data.time.length; i++) {
        // NED Velocity
        const v_ned = new THREE.Vector3(data.vn[i], data.ve[i], data.vd[i]);
        
        // Body to NED Quaternion
        // Note: app.js quaternionToEuler used (qw, qx, qy, qz)
        // THREE.Quaternion(x, y, z, w)
        const q_body_to_ned = new THREE.Quaternion(data.qx[i], data.qy[i], data.qz[i], data.qw[i]);
        
        // Velocity in Body Frame: v_body = q* . v_ned . q (where q is Body->NED)
        // In THREE.js: v.applyQuaternion(q.invert())
        const v_body = v_ned.clone().applyQuaternion(q_body_to_ned.clone().invert());
        
        // Calculate Angles
        const speed = v_body.length();
        
        // Absolute AoA: Angle between Velocity and Body X (Forward)
        // Body X is (1, 0, 0)
        // dot(v, x) = v.x
        // angle = acos(v.x / speed)
        let abs_aoa = 0;
        if (speed > 0.001) {
            const val = Math.min(1.0, Math.max(-1.0, v_body.x / speed));
            abs_aoa = Math.acos(val);
        }
        
        // Pitch AoA (Alpha): Angle in X-Z plane
        // alpha = atan2(vz, vx)
        const alpha = Math.atan2(v_body.z, v_body.x);
        
        // Yaw AoA (Beta/Sideslip): Angle in X-Y plane or relative to velocity vector plane
        // beta = atan2(vy, vx) -- commonly used approximation or definition
        // Strict definition sin(beta) = vy / V
        const beta = Math.atan2(v_body.y, v_body.x);
        
        aoa.absolute.push(abs_aoa * 180 / Math.PI);
        aoa.pitch.push(alpha * 180 / Math.PI);
        aoa.yaw.push(beta * 180 / Math.PI);
    }
    
    return aoa;
}

function createAoAChart() {
    const ctx = document.getElementById('chart-aoa').getContext('2d');
    
    if (charts.aoa) charts.aoa.destroy();
    
    const aoaData = computeAoA(testData);
    
    const step = Math.max(1, Math.floor(refData.time.length / 500));
    const labels = refData.time.filter((_, i) => i % step === 0);
    
    charts.aoa = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                { label: 'Absolute AoA', data: aoaData.absolute.filter((_, i) => i % step === 0), borderColor: '#f472b6', backgroundColor: 'rgba(244, 114, 182, 0.1)', tension: 0.1, pointRadius: 0 },
                { label: 'Pitch AoA (α)', data: aoaData.pitch.filter((_, i) => i % step === 0), borderColor: '#34d399', backgroundColor: 'rgba(52, 211, 153, 0.1)', tension: 0.1, pointRadius: 0 },
                { label: 'Yaw AoA (β)', data: aoaData.yaw.filter((_, i) => i % step === 0), borderColor: '#60a5fa', backgroundColor: 'rgba(96, 165, 250, 0.1)', tension: 0.1, pointRadius: 0 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { labels: { color: '#94a3b8' } },
                zoom: zoomPanOptions,
                tooltip: {
                    backgroundColor: 'rgba(20, 20, 30, 0.9)',
                    titleColor: '#f8fafc',
                    bodyColor: '#94a3b8',
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderWidth: 1,
                    padding: 12,
                    displayColors: true
                }
            },
            scales: {
                x: { title: { display: true, text: 'Time [s]', color: '#94a3b8' }, ticks: { color: '#64748b', maxTicksLimit: 5, font: { size: 14 }, callback: v => Number(v).toPrecision(5) }, grid: { color: 'rgba(255,255,255,0.05)' } },
                y: { title: { display: true, text: 'Angle [deg]', color: '#94a3b8' }, ticks: { color: '#64748b' }, grid: { color: 'rgba(255,255,255,0.05)' } }
            }
        }
    }); 
}


// ========================================
// THREE.JS 3D VISUALIZATION
// ========================================
// Helper to create text sprites
function createTextSprite(message, parameters = {}) {
    const fontface = parameters.fontface || "Courier New";
    const fontsize = parameters.fontsize || 24;
    const borderThickness = parameters.borderThickness || 2;
    const borderColor = parameters.borderColor || { r:0, g:0, b:0, a:1.0 };
    const backgroundColor = parameters.backgroundColor || { r:255, g:255, b:255, a:1.0 };
    const textColor = parameters.textColor || { r:255, g:255, b:255, a:1.0 };

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    
    // Set font first to measure size
    context.font = "Bold " + fontsize + "px " + fontface;
    const metrics = context.measureText( message );
    const textWidth = metrics.width;
    
    // Resize canvas to fit the text + margins
    // Note: Resizing clears the canvas, so we must draw AFTER this.
    canvas.width = textWidth + borderThickness * 4;
    canvas.height = fontsize * 1.4 + borderThickness * 4;
    
    // Restore context properties after resize
    context.font = "Bold " + fontsize + "px " + fontface;
    
    // background color
    context.fillStyle   = "rgba(" + backgroundColor.r + "," + backgroundColor.g + "," + backgroundColor.b + "," + backgroundColor.a + ")";
    // border color
    context.strokeStyle = "rgba(" + borderColor.r + "," + borderColor.g + "," + borderColor.b + "," + borderColor.a + ")";
    context.lineWidth = borderThickness;
    
    // text color
    context.fillStyle = "rgba(" + textColor.r + "," + textColor.g + "," + textColor.b + "," + textColor.a + ")";
    
    // Draw text centered in the expanded canvas
    context.fillText( message, borderThickness * 2, fontsize + borderThickness * 2);
    
    // canvas contents will be used for a texture
    const texture = new THREE.CanvasTexture(canvas); 
    const spriteMaterial = new THREE.SpriteMaterial( { map: texture } );
    const sprite = new THREE.Sprite( spriteMaterial );
    
    // Fix Aspect Ratio
    const scaleY = fontsize / 20;
    const scaleX = scaleY * (canvas.width / canvas.height);
    sprite.scale.set(scaleX, scaleY, 1.0);
    
    return sprite;
}

function init3DScene() {
    // We now have two containers: main and chase
    const containerMain = document.getElementById('three-container-main');
    const containerChase = document.getElementById('three-container-chase');
    
    // Width/Height for each
    const w1 = containerMain.clientWidth;
    const h1 = containerMain.clientHeight;
    const w2 = containerChase.clientWidth;
    const h2 = containerChase.clientHeight;
    
    // Scene setup (Shared Scene)
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a25);
    
    // Cameras
    // Main Camera (Orbit)
    const cameraMain = new THREE.PerspectiveCamera(60, w1 / h1, 0.1, 100000);
    cameraMain.position.set(500, 500, 500);
    
    // Chase Camera (Perspective)
    const cameraChase = new THREE.PerspectiveCamera(60, w2 / h2, 0.1, 100000);
    cameraChase.position.set(-50, 10, 0); // Initial relative position
    
    // Renderers
    const rendererMain = new THREE.WebGLRenderer({ antialias: true });
    rendererMain.setSize(w1, h1);
    rendererMain.setPixelRatio(window.devicePixelRatio);
    containerMain.innerHTML = '';
    containerMain.appendChild(rendererMain.domElement);
    
    const rendererChase = new THREE.WebGLRenderer({ antialias: true });
    rendererChase.setSize(w2, h2);
    rendererChase.setPixelRatio(window.devicePixelRatio);
    containerChase.innerHTML = '';
    containerChase.appendChild(rendererChase.domElement);
    
    // Controls for Main
    const controls = new OrbitControls(cameraMain, rendererMain.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    
    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(100, 500, 100);
    scene.add(dirLight);
    
    // Grid
    const gridHelper = new THREE.GridHelper(10000, 200, 0x444444, 0x333333);
    scene.add(gridHelper);
    
    // Axes helper
    const axesHelper = new THREE.AxesHelper(100);
    scene.add(axesHelper);

    // Plane Model Group
    const planeGroup = new THREE.Group();
    
    // Fuselage
    const fuselageGeom = new THREE.ConeGeometry(2, 10, 8);
    fuselageGeom.rotateX(Math.PI / 2); // Point along Z
    const fuselageMat = new THREE.MeshPhongMaterial({ color: 0xcccccc });
    const fuselage = new THREE.Mesh(fuselageGeom, fuselageMat);
    planeGroup.add(fuselage);
    
    // Wings
    const wingGeom = new THREE.BoxGeometry(12, 0.5, 3);
    const wingMat = new THREE.MeshPhongMaterial({ color: 0x3b82f6 });
    const wing = new THREE.Mesh(wingGeom, wingMat);
    wing.position.z = 0;
    planeGroup.add(wing);
    
    // Tail
    const tailGeom = new THREE.BoxGeometry(4, 0.5, 2);
    const tail = new THREE.Mesh(tailGeom, wingMat);
    tail.position.z = -4;
    planeGroup.add(tail);
    
    const vStabGeom = new THREE.BoxGeometry(0.5, 3, 2);
    const vStab = new THREE.Mesh(vStabGeom, wingMat);
    vStab.position.set(0, 1.5, -4);
    planeGroup.add(vStab);
    
    // AoA Visualization Group (Attached to plane)
    const aoaGroup = new THREE.Group();
    planeGroup.add(aoaGroup);
    
    // Create text sprites for AoA
    const spritePitch = createTextSprite("α: 0.0°", { fontsize: 32, textColor: {r:0, g:255, b:0, a:1} });
    spritePitch.position.set(0, 3, 0); // Closer Above
    aoaGroup.add(spritePitch);
    
    const spriteYaw = createTextSprite("β: 0.0°", { fontsize: 32, textColor: {r:255, g:165, b:0, a:1} });
    spriteYaw.material.depthTest = false; // Draw over plane
    spriteYaw.position.set(6, 0, 0); // Closer Right
    aoaGroup.add(spriteYaw);
    
    planeGroup.visible = false;
    scene.add(planeGroup);
    
    // Chase Camera Controls State
    const chaseCameraState = {
        distance: 30,      // Distance from plane
        azimuth: Math.PI,  // Horizontal angle (radians)
        elevation: 0.3,    // Vertical angle (radians)
        isDragging: false,
        lastMouseX: 0,
        lastMouseY: 0
    };
    
    // Store for later updates
    threeScene = { 
        scene, 
        cameraMain,
        cameraChase,
        rendererMain,
        rendererChase,
        controls, 
        objects: { 
            plane: planeGroup,
            aoaSprites: { pitch: spritePitch, yaw: spriteYaw }
        },
        playback: { 
            isPlaying: false, 
            index: 0,
            lastFrameTime: 0
        },
        chaseCameraState
    };
    
    // UI Controls (Common)
    const slider = document.getElementById('time-slider');
    const playBtn = document.getElementById('btn-play-pause');
    const playIcon = playBtn.querySelector('.play-icon');
    const pauseIcon = playBtn.querySelector('.pause-icon');
    
    // Fix: We should assign `oninput` instead of addEventListener for idempotency if simple
    slider.oninput = (e) => {
        if (!testData) return;
        const idx = parseInt(e.target.value);
        threeScene.playback.index = idx;
        updatePlanePosition(idx);
        if (threeScene.playback.isPlaying) togglePlay();
    };

    // Toggle Play
    playBtn.onclick = togglePlay;

    // Chase Camera Controls - Mouse interaction
    rendererChase.domElement.addEventListener('mousedown', (e) => {
        chaseCameraState.isDragging = true;
        chaseCameraState.lastMouseX = e.clientX;
        chaseCameraState.lastMouseY = e.clientY;
        e.preventDefault();
    });

    rendererChase.domElement.addEventListener('mousemove', (e) => {
        if (!chaseCameraState.isDragging) return;
        
        const deltaX = e.clientX - chaseCameraState.lastMouseX;
        const deltaY = e.clientY - chaseCameraState.lastMouseY;
        
        // Update angles (fixed inversion)
        chaseCameraState.azimuth += deltaX * 0.01;
        chaseCameraState.elevation = Math.max(
            -Math.PI / 2 + 0.1,
            Math.min(Math.PI / 2 - 0.1, chaseCameraState.elevation + deltaY * 0.01)
        );
        
        chaseCameraState.lastMouseX = e.clientX;
        chaseCameraState.lastMouseY = e.clientY;
        e.preventDefault();
    });

    rendererChase.domElement.addEventListener('mouseup', () => {
        chaseCameraState.isDragging = false;
    });

    rendererChase.domElement.addEventListener('mouseleave', () => {
        chaseCameraState.isDragging = false;
    });

    // Chase Camera Controls - Scroll for distance
    rendererChase.domElement.addEventListener('wheel', (e) => {
        const delta = e.deltaY * 0.05;
        chaseCameraState.distance = Math.max(5, Math.min(200, chaseCameraState.distance + delta));
        e.preventDefault();
    });

    // Chase Camera Controls - Touch support
    let touchStartDistance = 0;
    
    rendererChase.domElement.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
            // Single finger - rotation
            chaseCameraState.isDragging = true;
            chaseCameraState.lastMouseX = e.touches[0].clientX;
            chaseCameraState.lastMouseY = e.touches[0].clientY;
        } else if (e.touches.length === 2) {
            // Two fingers - pinch to zoom
            chaseCameraState.isDragging = false;
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            touchStartDistance = Math.sqrt(dx * dx + dy * dy);
        }
        e.preventDefault();
    });

    rendererChase.domElement.addEventListener('touchmove', (e) => {
        if (e.touches.length === 1 && chaseCameraState.isDragging) {
            // Single finger drag - rotation
            const deltaX = e.touches[0].clientX - chaseCameraState.lastMouseX;
            const deltaY = e.touches[0].clientY - chaseCameraState.lastMouseY;
            
            chaseCameraState.azimuth += deltaX * 0.01;
            chaseCameraState.elevation = Math.max(
                -Math.PI / 2 + 0.1,
                Math.min(Math.PI / 2 - 0.1, chaseCameraState.elevation + deltaY * 0.01)
            );
            
            chaseCameraState.lastMouseX = e.touches[0].clientX;
            chaseCameraState.lastMouseY = e.touches[0].clientY;
        } else if (e.touches.length === 2) {
            // Two finger pinch - zoom
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (touchStartDistance > 0) {
                const delta = (touchStartDistance - distance) * 0.2;
                chaseCameraState.distance = Math.max(5, Math.min(200, chaseCameraState.distance + delta));
                touchStartDistance = distance;
            }
        }
        e.preventDefault();
    });

    rendererChase.domElement.addEventListener('touchend', (e) => {
        if (e.touches.length === 0) {
            chaseCameraState.isDragging = false;
            touchStartDistance = 0;
        } else if (e.touches.length === 1) {
            // Reset for single finger after multi-touch
            chaseCameraState.isDragging = true;
            chaseCameraState.lastMouseX = e.touches[0].clientX;
            chaseCameraState.lastMouseY = e.touches[0].clientY;
            touchStartDistance = 0;
        }
        e.preventDefault();
    });

    rendererChase.domElement.addEventListener('touchcancel', () => {
        chaseCameraState.isDragging = false;
        touchStartDistance = 0;
    });


    function togglePlay() {
        if (!testData) return;
        threeScene.playback.isPlaying = !threeScene.playback.isPlaying;
        if (threeScene.playback.isPlaying) {
            playIcon.style.display = 'none';
            pauseIcon.style.display = 'block';
            threeScene.playback.lastFrameTime = performance.now();
            if (threeScene.playback.index >= testData.time.length - 1) {
                threeScene.playback.index = 0;
            }
        } else {
            playIcon.style.display = 'block';
            pauseIcon.style.display = 'none';
        }
    }
    
    // Animation loop
    function animate(time) {
        requestAnimationFrame(animate);
        controls.update();
        
        if (threeScene.playback.isPlaying && testData) {
            const dt = (time - threeScene.playback.lastFrameTime) / 1000;
            threeScene.playback.lastFrameTime = time;
            const speedMultiplier = 5; 
            threeScene.playback.index = Math.min(
                testData.time.length - 1, 
                threeScene.playback.index + speedMultiplier
            );
            const intIndex = Math.floor(threeScene.playback.index);
            slider.value = intIndex;
            updatePlanePosition(intIndex);
            
            if (intIndex >= testData.time.length - 1) {
                togglePlay();
            }
        }
        
        // Render Main View
        rendererMain.render(scene, cameraMain);
        
        // Update Chase Camera (Controllable with spherical coordinates)
        if (planeGroup.visible) {
            const { distance, azimuth, elevation } = threeScene.chaseCameraState;
            
            // Calculate camera position using spherical coordinates
            // Position in local camera space (relative to plane)
            const x = distance * Math.cos(elevation) * Math.cos(azimuth);
            const y = distance * Math.sin(elevation);
            const z = distance * Math.cos(elevation) * Math.sin(azimuth);
            
            const relativeOffset = new THREE.Vector3(x, y, z);
            
            // Apply plane's rotation to the offset
            const cameraOffset = relativeOffset.clone().applyQuaternion(planeGroup.quaternion);
            
            // Set camera position relative to plane
            cameraChase.position.copy(planeGroup.position).add(cameraOffset);
            
            // Always look at the plane
            cameraChase.lookAt(planeGroup.position);
            
            // Keep up vector aligned with plane's up direction
            cameraChase.up.copy(new THREE.Vector3(0, 1, 0).applyQuaternion(planeGroup.quaternion)); 
        }
        
        rendererChase.render(scene, cameraChase);
    }
    animate(0);
    
    // Handle resize
    window.addEventListener('resize', () => {
        const cw1 = containerMain.clientWidth;
        const ch1 = containerMain.clientHeight;
        cameraMain.aspect = cw1 / ch1;
        cameraMain.updateProjectionMatrix();
        rendererMain.setSize(cw1, ch1);
        
        const cw2 = containerChase.clientWidth;
        const ch2 = containerChase.clientHeight;
        cameraChase.aspect = cw2 / ch2;
        cameraChase.updateProjectionMatrix();
        rendererChase.setSize(cw2, ch2);
    });
}


function update3DTrajectories() {
    if (!threeScene || !refData || !testData) return;
    
    const { scene, cameraMain, controls, objects } = threeScene;
    
    // Remove old objects lines/markers
    ['refLine', 'testLine', 'refStart', 'refEnd', 'testStart', 'testEnd'].forEach(name => {
        if (objects[name]) {
            scene.remove(objects[name]);
            if (objects[name].geometry) objects[name].geometry.dispose();
            delete objects[name];
        }
    });

    // Convert to NED
    const refNED = convertToNED(refData.lat, refData.lon, refData.alt, refData.lat[0], refData.lon[0], refData.alt[0]);
    const testNED = convertToNED(testData.lat, testData.lon, testData.alt, testData.lat[0], testData.lon[0], testData.alt[0]);
    
    // Store for playback
    threeScene.data = { testNED, refNED };
    
    // Downsample for performance (lines)
    const step = Math.max(1, Math.floor(refData.time.length / 2000));
    
    // Create reference trajectory line
    const refGeometry = new THREE.BufferGeometry();
    const refPoints = [];
    for (let i = 0; i < refNED.east.length; i += step) {
        refPoints.push(refNED.east[i], -refNED.down[i], refNED.north[i]);
    }
    refGeometry.setAttribute('position', new THREE.Float32BufferAttribute(refPoints, 3));
    const refMaterial = new THREE.LineBasicMaterial({ color: 0x3b82f6, linewidth: 2 });
    objects.refLine = new THREE.Line(refGeometry, refMaterial);
    scene.add(objects.refLine);
    
    // Create test trajectory line
    const testGeometry = new THREE.BufferGeometry();
    const testPoints = [];
    for (let i = 0; i < testNED.east.length; i += step) {
        testPoints.push(testNED.east[i], -testNED.down[i], testNED.north[i]);
    }
    testGeometry.setAttribute('position', new THREE.Float32BufferAttribute(testPoints, 3));
    const testMaterial = new THREE.LineBasicMaterial({ color: 0xef4444, linewidth: 2 });
    objects.testLine = new THREE.Line(testGeometry, testMaterial);
    scene.add(objects.testLine);
    
    // Start/End markers
    const sphereGeom = new THREE.SphereGeometry(5, 16, 16);
    
    objects.refStart = new THREE.Mesh(sphereGeom, new THREE.MeshBasicMaterial({ color: 0x4ade80 }));
    objects.refStart.position.set(refNED.east[0], -refNED.down[0], refNED.north[0]);
    scene.add(objects.refStart);
    
    const nRef = refNED.east.length - 1;
    objects.refEnd = new THREE.Mesh(sphereGeom, new THREE.MeshBasicMaterial({ color: 0xfacc15 }));
    objects.refEnd.position.set(refNED.east[nRef], -refNED.down[nRef], refNED.north[nRef]);
    scene.add(objects.refEnd);
    
    // Fit camera to scene (Main Camera)
    const box = new THREE.Box3().setFromObject(objects.refLine);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    
    cameraMain.position.set(center.x + maxDim, center.y + maxDim * 0.5, center.z + maxDim);
    controls.target.copy(center);
    controls.update();

    // Reset Playback
    threeScene.playback.index = 0;
    threeScene.playback.isPlaying = false;
    
    const slider = document.getElementById('time-slider');
    slider.max = testData.time.length - 1;
    slider.value = 0;
    slider.disabled = false;
    
    // Show plane
    if (objects.plane) {
        objects.plane.visible = true;
        updatePlanePosition(0);
    }
    
    // Update play icon state
    document.querySelector('.play-icon').style.display = 'block';
    document.querySelector('.pause-icon').style.display = 'none';
}

function updatePlanePosition(index) {
    if (!threeScene || !threeScene.data || !threeScene.data.testNED || !threeScene.objects.plane) return;
    
    const { testNED } = threeScene.data;
    const plane = threeScene.objects.plane;
    
    // Validate index
    index = Math.max(0, Math.min(index, testNED.east.length - 1));
    
    // Position (East -> X, Down -> -Y, North -> Z)
    plane.position.set(testNED.east[index], -testNED.down[index], testNED.north[index]);
    
    // Attitude
    if (testData.qx && testData.qy && testData.qz && testData.qw) {
        plane.quaternion.set(
            -testData.qy[index],
            testData.qz[index],
            -testData.qx[index],
            testData.qw[index]
        );
    }
    
    // Update AoA Sprites
    if (threeScene.objects.aoaSprites && testData) {
        // Calculate AoA for this frame
        const v_ned = new THREE.Vector3(testData.vn[index], testData.ve[index], testData.vd[index]);
        const q_body_to_ned = new THREE.Quaternion(testData.qx[index], testData.qy[index], testData.qz[index], testData.qw[index]);
        const v_body = v_ned.clone().applyQuaternion(q_body_to_ned.invert());
        
        const alpha = Math.atan2(v_body.z, v_body.x) * 180 / Math.PI;
        const beta = Math.atan2(v_body.y, v_body.x) * 180 / Math.PI;
        
        // Update sprites if they exist
        const sprites = threeScene.objects.aoaSprites;
        
        // Re-create textures? Or TextSprite helper returns a sprite with a material.
        // We need to update the map. Since we created a helper that returns a sprite,
        // we might want to update the material map.
        // Updating canvas texture dynamically is expensive if done every frame?
        // It's robust enough for a viewer.
        
        // Helper to update sprite text
        function updateSprite(sprite, text, color) {
             const canvas = sprite.material.map.image; 
             const context = canvas.getContext('2d');
             const w = canvas.width; 
             const h = canvas.height;
             // We can't easily resize the canvas if text grows, but let's clear and draw
             // Actually `createTextSprite` makes a tight fit. Better to recreate or have a specialized updater.
             // To save complexity, I'll just dispose and recreate? No, that flickers.
             // I'll make a specialized updater or just use the helper to create a new map.
             
             // Simplest: Create new sprite and replace in parent?
             // Or update map.
             
             const fontsize = 32;
             const borderThickness = 2;
             
             // Measure new text
             context.clearRect(0,0,w,h);
             const metrics = context.measureText(text);
             // If width changed significantly, we might need resize.
             // For simplicity, let's assume fixed canvas size large enough?
             // No, createTextSprite adapts.
             
             // Let's just create a NEW material/texture and swap it. 
             // Or better: update the sprite by removing old and adding new.
             // But let's check performance. It's fine for 60fps.
             
             // Removing/Adding:
             // aoaGroup.remove(sprite)...
        }
        
        // Actually, let's just create new sprites and replace them in the group.
        // A bit wasteful but easy.
        const aoaGroup = plane.children.find(c => c.type === 'Group' && c.children.find(k => k.isSprite));
        if (aoaGroup) {
            aoaGroup.clear(); // Removes all children
            
            const sPitch = createTextSprite(`α: ${alpha.toFixed(1)}°`, { fontsize: 32, textColor: {r:0, g:255, b:0, a:1} });
            sPitch.position.set(0, 3, 0);
            aoaGroup.add(sPitch);
            
            const sYaw = createTextSprite(`β: ${beta.toFixed(1)}°`, { fontsize: 32, textColor: {r:255, g:165, b:0, a:1} });
            sYaw.material.depthTest = false; // Draw over plane
            sYaw.position.set(6, 0, 0);
            aoaGroup.add(sYaw);
        }
    }
    
    // Update Time Display
    const time = testData.time[index];
    const timeDisplay = document.getElementById('time-display');
    if (timeDisplay) {
        timeDisplay.textContent = `Time: ${time.toFixed(2)}s`;
    }
}

// ========================================
// EVENT HANDLERS
// ========================================
function handleFileUpload(event, type) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = parseTrajectoryFile(e.target.result);
            
            if (type === 'reference') {
                refData = data;
                document.getElementById('ref-filename').textContent = file.name;
                document.getElementById('upload-reference').classList.add('loaded');
                document.getElementById('ref-status').textContent = `${data.time.length} samples`;
                document.getElementById('ref-status').className = 'upload-status success';
            } else {
                testData = data;
                document.getElementById('test-filename').textContent = file.name;
                document.getElementById('upload-test').classList.add('loaded');
                document.getElementById('test-status').textContent = `${data.time.length} samples`;
                document.getElementById('test-status').className = 'upload-status success';
            }
            
            updateAnalyzeButton();
            showToast('success', `Loaded ${file.name} (${data.time.length} samples)`);
        } catch (err) {
            showToast('error', `Failed to parse file: ${err.message}`);
        }
    };
    reader.readAsText(file);
}

function updateAnalyzeButton() {
    const btn = document.getElementById('btn-analyze');
    btn.disabled = !(refData && testData);
}

function runAnalysis() {
    if (!refData || !testData) return;
    
    const refAnalysis = analyzeTrajectory(refData);
    const testAnalysis = analyzeTrajectory(testData);
    
    renderAnalysisCard('ref-analysis', refAnalysis, 'Reference');
    renderAnalysisCard('test-analysis', testAnalysis, 'SENF Output');
    renderComparisonCard(refAnalysis, testAnalysis);
    renderVerdict(testAnalysis);
    
    createAttitudeChart();
    createVelocityChart();
    createErrorChart();
    createAoAChart();
    
    update3DTrajectories();
    
    showToast('success', 'Analysis complete!');
}

function switchTab(tabId) {
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    
    document.querySelector(`[data-tab="${tabId}"]`).classList.add('active');
    document.getElementById(`tab-${tabId}`).classList.add('active');
    
    if (tabId === '3d' && !threeScene) {
        init3DScene();
        if (refData && testData) update3DTrajectories();
    }
}

function showToast(type, message) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <span class="toast-icon">${type === 'success' ? '✓' : type === 'error' ? '✗' : 'ℹ'}</span>
        <span class="toast-message">${message}</span>
    `;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ========================================
// INITIALIZATION
// ========================================
document.addEventListener('DOMContentLoaded', () => {
    // File upload handlers
    document.getElementById('upload-reference').addEventListener('click', () => 
        document.getElementById('file-reference').click()
    );
    document.getElementById('upload-test').addEventListener('click', () => 
        document.getElementById('file-test').click()
    );
    document.getElementById('file-reference').addEventListener('change', (e) => handleFileUpload(e, 'reference'));
    document.getElementById('file-test').addEventListener('change', (e) => handleFileUpload(e, 'test'));
    
    // Analyze button
    document.getElementById('btn-analyze').addEventListener('click', runAnalysis);
    
    // Tab navigation
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });
    
    // Sample data variant mapping
    const sampleDataVariants = {
        'low_noise_low_delay': { data: SAMPLE_SENF_LOW_NOISE_LOW_DELAY, label: 'Low Noise / Low Delay (0.1s, 0.5x)' },
        'high_noise_low_delay': { data: SAMPLE_SENF_HIGH_NOISE_LOW_DELAY, label: 'High Noise / Low Delay (0.1s, 5.0x)' },
        'low_noise_high_delay': { data: SAMPLE_SENF_LOW_NOISE_HIGH_DELAY, label: 'Low Noise / High Delay (2.0s, 0.5x)' },
        'high_noise_high_delay': { data: SAMPLE_SENF_HIGH_NOISE_HIGH_DELAY, label: 'High Noise / High Delay (2.0s, 5.0x)' }
    };
    
    // Load sample data buttons - 4 variants
    document.querySelectorAll('.btn-sample').forEach(btn => {
        btn.addEventListener('click', () => {
            const variant = btn.dataset.variant;
            const variantInfo = sampleDataVariants[variant];
            
            if (!variantInfo) {
                showToast('error', `Unknown variant: ${variant}`);
                return;
            }
            
            showToast('info', `Loading ${variantInfo.label}...`);
            
            try {
                refData = parseTrajectoryFile(SAMPLE_REFERENCE_DATA);
                testData = parseTrajectoryFile(variantInfo.data);
                
                document.getElementById('ref-filename').textContent = 'ins_data.txt (reference)';
                document.getElementById('test-filename').textContent = variantInfo.label;
                document.getElementById('upload-reference').classList.add('loaded');
                document.getElementById('upload-test').classList.add('loaded');
                document.getElementById('ref-status').textContent = `${refData.time.length} samples`;
                document.getElementById('ref-status').className = 'upload-status success';
                document.getElementById('test-status').textContent = `${testData.time.length} samples`;
                document.getElementById('test-status').className = 'upload-status success';
                
                updateAnalyzeButton();
                showToast('success', `Loaded ${variantInfo.label} (${testData.time.length} samples)`);
            } catch (err) {
                showToast('error', `Failed to parse embedded data: ${err.message}`);
            }
        });
    });
    
    // 3D View controls
    document.getElementById('toggle-ref').addEventListener('change', (e) => {
        if (threeScene?.objects.refLine) {
            threeScene.objects.refLine.visible = e.target.checked;
            if (threeScene.objects.refStart) threeScene.objects.refStart.visible = e.target.checked;
            if (threeScene.objects.refEnd) threeScene.objects.refEnd.visible = e.target.checked;
        }
    });
    
    document.getElementById('toggle-test').addEventListener('change', (e) => {
        if (threeScene?.objects.testLine) {
            threeScene.objects.testLine.visible = e.target.checked;
        }
    });
    
    document.getElementById('btn-reset-camera').addEventListener('click', () => {
        if (threeScene) {
            threeScene.controls.reset();
            update3DTrajectories();
        }
    });
    
    // Export buttons
    document.getElementById('btn-export-attitude').addEventListener('click', () => exportChart('attitude'));
    document.getElementById('btn-export-velocity').addEventListener('click', () => exportChart('velocity'));
    document.getElementById('btn-export-error').addEventListener('click', () => exportChart('error'));
    document.getElementById('btn-export-aoa').addEventListener('click', () => exportChart('aoa'));
    
    // Reset zoom buttons
    document.querySelectorAll('.btn-reset-zoom').forEach(btn => {
        btn.addEventListener('click', () => {
            const chartName = btn.dataset.chart;
            if (charts[chartName]) {
                charts[chartName].resetZoom();
                // Clear zoom history for this chart
                zoomHistory[chartName] = [];
                showToast('info', `Reset ${chartName} chart zoom`);
            }
        });
    });
    
    // Undo zoom buttons
    document.querySelectorAll('.btn-undo-zoom').forEach(btn => {
        btn.addEventListener('click', () => {
            const chartName = btn.dataset.chart;
            if (undoZoom(chartName)) {
                showToast('info', `Undid zoom on ${chartName} chart`);
            } else {
                showToast('info', 'No zoom history to undo');
            }
        });
    });
    
    // Fullscreen buttons
    document.querySelectorAll('.btn-fullscreen').forEach(btn => {
        btn.addEventListener('click', () => {
            const chartName = btn.dataset.chart;
            const title = btn.dataset.title;
            openFullscreenModal(chartName, title);
        });
    });
    
    // Modal controls
    document.getElementById('modal-close').addEventListener('click', closeFullscreenModal);
    document.getElementById('modal-reset-zoom').addEventListener('click', () => {
        if (modalChart) {
            modalChart.resetZoom();
            // Clear modal zoom history
            zoomHistory.modal = [];
        }
    });
    document.getElementById('modal-undo-zoom').addEventListener('click', () => {
        if (undoZoom('modal')) {
            showToast('info', 'Undid zoom');
        } else {
            showToast('info', 'No zoom history to undo');
        }
    });
    
    // Close modal on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeFullscreenModal();
        }
    });
    
    // Close modal on backdrop click
    document.getElementById('plot-modal').addEventListener('click', (e) => {
        if (e.target.id === 'plot-modal') {
            closeFullscreenModal();
        }
    });
});

// ========================================
// FULLSCREEN MODAL
// ========================================
function openFullscreenModal(chartName, title) {
    if (!charts[chartName]) {
        showToast('error', 'Chart not available. Run analysis first.');
        return;
    }
    
    const modal = document.getElementById('plot-modal');
    document.getElementById('modal-title').textContent = title;
    
    // Get the source chart's configuration
    const sourceChart = charts[chartName];
    const config = sourceChart.config;
    
    // Destroy existing modal chart
    if (modalChart) {
        modalChart.destroy();
        modalChart = null;
    }
    
    // Create a new chart in the modal with the same data
    const ctx = document.getElementById('modal-chart').getContext('2d');
    
    // Deep clone the datasets
    const clonedDatasets = config.data.datasets.map(ds => ({
        ...ds,
        data: [...ds.data]
    }));
    
    // Create modal chart with enhanced options for larger view
    modalChart = new Chart(ctx, {
        type: config.type,
        data: {
            labels: [...config.data.labels],
            datasets: clonedDatasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { 
                    labels: { 
                        color: '#94a3b8',
                        font: { size: 14 }
                    },
                    position: 'top'
                },
                zoom: zoomPanOptions,
                tooltip: {
                    backgroundColor: 'rgba(20, 20, 30, 0.95)',
                    titleColor: '#f8fafc',
                    titleFont: { size: 14 },
                    bodyColor: '#94a3b8',
                    bodyFont: { size: 12 },
                    borderColor: 'rgba(255,255,255,0.15)',
                    borderWidth: 1,
                    padding: 16,
                    displayColors: true,
                    caretSize: 8
                }
            },
            scales: {
                x: { 
                    title: { 
                        display: true, 
                        text: config.options.scales.x.title.text, 
                        color: '#94a3b8',
                        font: { size: 14 }
                    }, 
                    ticks: { 
                        color: '#64748b', 
                        maxTicksLimit: 10, 
                        font: { size: 12 }, 
                        callback: v => Number(v).toPrecision(5) 
                    }, 
                    grid: { color: 'rgba(255,255,255,0.08)' } 
                },
                y: { 
                    title: { 
                        display: true, 
                        text: config.options.scales.y.title.text, 
                        color: '#94a3b8',
                        font: { size: 14 }
                    }, 
                    ticks: { 
                        color: '#64748b',
                        font: { size: 12 }
                    }, 
                    grid: { color: 'rgba(255,255,255,0.08)' } 
                }
            }
        }
    });
    
    currentModalChartName = chartName;
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    
    // Force resize after modal is visible
    setTimeout(() => {
        modalChart.resize();
    }, 100);
}

function closeFullscreenModal() {
    const modal = document.getElementById('plot-modal');
    modal.classList.remove('active');
    document.body.style.overflow = '';
    
    if (modalChart) {
        modalChart.destroy();
        modalChart = null;
    }
    currentModalChartName = null;
}

function exportChart(name) {
    if (charts[name]) {
        const link = document.createElement('a');
        link.download = `${name}_comparison.png`;
        link.href = charts[name].toBase64Image();
        link.click();
        showToast('success', `Exported ${name} chart`);
    }
}

