/*
 * Smart Battery Card for Home Assistant (no build step, HACS-friendly)
 * Author: Alex Hryhor
 * Version: 0.5.1
*
* Config example:
* type: custom:smart-battery-card
* batteries:
*   - entity: sensor.delta_2_main_battery_level
*     name: Delta 2
*     remaining_time_entity: sensor.delta_2_discharge_remaining_time
*     charge_remaining_time_entity: sensor.delta_2_charge_remaining_time
*     ac_out_power_entity: sensor.delta_2_ac_out_power
*   - entity: sensor.river_2_battery_level
*     name: River 2
*     remaining_time_entity: sensor.river_2_discharge_remaining_time
*     charge_remaining_time_entity: sensor.river_2_charge_remaining_time
*     ac_out_power_entity: sensor.river_2_ac_out_power
* 
* selected_battery: 0  # Index of battery for outage analysis (0 = first battery)
* 
* # Outage settings (shared across all batteries)
* outage_status_entity: sensor.outage_status
* outage_end_time_entity: sensor.outage_end_time
* next_outage_time_entity: sensor.next_outage_time
* outage_schedule_status_entity: sensor.outage_status_today
* 
* # Display settings (applied to all batteries)
* green: 60
* yellow: 25
* palette: gradient
* segments: 5
* gap: 3
* precision: 0
* show_state: true
*/

/* Lit helpers from HA (pattern used by many cards) */
const LitBase = customElements.get('ha-panel-lovelace')
  ? Object.getPrototypeOf(customElements.get('ha-panel-lovelace'))
  : Object.getPrototypeOf(customElements.get('hui-masonry-view'));

const html = LitBase.prototype.html;
const css = LitBase.prototype.css;
const svg = LitBase.prototype.svg || ((strings, ...values) => strings.raw ? strings : strings);

class SmartBatteryCard extends LitBase {
  static get properties() {
    return {
      hass: {},
      _config: {},
    };
  }

  setConfig(config) {
    if (!config || !config.batteries || !Array.isArray(config.batteries) || config.batteries.length === 0) {
      throw new Error('You must specify at least one battery in the "batteries" array.');
    }

    // Validate each battery has required entity
    config.batteries.forEach((battery, index) => {
      if (!battery.entity) {
        throw new Error(`Battery at index ${index} is missing required "entity" field.`);
      }
    });

    this._config = {
      batteries: config.batteries.map(battery => ({
        entity: battery.entity,
        name: battery.name || '',
        remaining_time_entity: battery.remaining_time_entity || null,
        charge_remaining_time_entity: battery.charge_remaining_time_entity || null,
        ac_out_power_entity: battery.ac_out_power_entity || null,
        invert: !!battery.invert,
      })),
      selected_battery: typeof config.selected_battery === 'number' ? Math.max(0, Math.min(config.selected_battery, config.batteries.length - 1)) : 0,
      outage_status_entity: config.outage_status_entity || null,
      outage_end_time_entity: config.outage_end_time_entity || null,
      next_outage_time_entity: config.next_outage_time_entity || null,
      outage_schedule_status_entity: config.outage_schedule_status_entity || null,
      green: typeof config.green === 'number' ? config.green : 60,
      yellow: typeof config.yellow === 'number' ? config.yellow : 25,
      show_state: config.show_state !== false,
      precision: typeof config.precision === 'number' ? config.precision : 0,
      palette: ['threshold', 'gradient'].includes(config.palette) ? config.palette : 'threshold',
      segments: Number.isFinite(config.segments) ? Math.max(1, Math.floor(config.segments)) : 5,
      gap: Number.isFinite(config.gap) ? Math.max(0, config.gap) : 2,
    };
  }

  getCardSize() {
    const numBatteries = this._config?.batteries?.length || 1;
    return Math.ceil(numBatteries / 4) + 2;
  }

  _pct(batteryIndex) {
    const battery = this._config.batteries[batteryIndex];
    if (!battery) return 0;

    const st = this.hass?.states?.[battery.entity];
    if (!st) return 0;
    let n = Number(st.state);
    if (Number.isNaN(n)) {
      n = Number(st.attributes?.battery ?? st.attributes?.level ?? 0);
    }
    if (battery.invert) n = 100 - n;
    if (!Number.isFinite(n)) n = 0;
    return Math.max(0, Math.min(100, n));
  }

  _color(p) {
    if (this._config.palette === 'gradient') {
      // 0% -> красный (0deg), 100% -> зелёный (120deg)
      const h = Math.round((p / 100) * 120);
      return `hsl(${h} 65% 45%)`;
    }
    // threshold
    const y = this._config.yellow;
    const g = this._config.green;
    if (p < y) return 'var(--error-color, #e53935)';
    if (p < g) return 'var(--warning-color, #fbc02d)';
    return 'var(--success-color, #43a047)';
  }

  _remainingTime(batteryIndex) {
    const battery = this._config.batteries[batteryIndex];
    if (!battery) return null;

    // Try discharge time first
    if (battery.remaining_time_entity) {
      const dischargeSt = this.hass?.states?.[battery.remaining_time_entity];
      if (dischargeSt && dischargeSt.state && dischargeSt.state !== 'unknown' && dischargeSt.state !== 'unavailable') {
        const dischargeMinutes = this._parseTimeValue(dischargeSt.state);

        // If discharge time is valid and > 0, use it
        if (Number.isFinite(dischargeMinutes) && dischargeMinutes > 0) {
          return { time: this._formatMinutes(dischargeMinutes), type: 'discharge' };
        }
      }
    }

    // If discharge is 0 or unavailable, try charge time
    if (battery.charge_remaining_time_entity) {
      const chargeSt = this.hass?.states?.[battery.charge_remaining_time_entity];
      if (chargeSt && chargeSt.state && chargeSt.state !== 'unknown' && chargeSt.state !== 'unavailable') {
        const chargeMinutes = this._parseTimeValue(chargeSt.state);

        if (Number.isFinite(chargeMinutes) && chargeMinutes > 0) {
          return { time: this._formatMinutes(chargeMinutes), type: 'charge' };
        }
      }
    }

    return null;
  }

  /**
   * Parse time value from sensor state
   * Handles: "316m", "316", "5h 30m", etc.
   */
  _parseTimeValue(value) {
    if (!value) return NaN;

    // If it's already a number, return it
    const numValue = Number(value);
    if (Number.isFinite(numValue)) return numValue;

    // Parse string formats like "316m", "5h 30m", "2h", etc.
    const str = String(value).toLowerCase();
    let totalMinutes = 0;

    // Match hours (e.g., "5h")
    const hoursMatch = str.match(/(\d+)h/);
    if (hoursMatch) {
      totalMinutes += parseInt(hoursMatch[1]) * 60;
    }

    // Match minutes (e.g., "30m" or just "316m")
    const minutesMatch = str.match(/(\d+)m/);
    if (minutesMatch) {
      totalMinutes += parseInt(minutesMatch[1]);
    }

    // If no pattern matched, try to extract just the number
    if (totalMinutes === 0) {
      const numMatch = str.match(/(\d+)/);
      if (numMatch) {
        totalMinutes = parseInt(numMatch[1]);
      }
    }

    return totalMinutes > 0 ? totalMinutes : NaN;
  }

  _formatMinutes(totalMinutes) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = Math.round(totalMinutes % 60);

    if (hours > 0 && minutes > 0) {
      return `${hours}h ${minutes}m`;
    } else if (hours > 0) {
      return `${hours}h`;
    } else {
      return `${minutes}m`;
    }
  }

  _acOutPower(batteryIndex) {
    const battery = this._config.batteries[batteryIndex];
    if (!battery || !battery.ac_out_power_entity) return null;

    const st = this.hass?.states?.[battery.ac_out_power_entity];
    if (!st) return null;
    const value = st.state;
    if (!value || value === 'unknown' || value === 'unavailable') return null;

    const power = Number(value);
    if (!Number.isFinite(power) || power < 0) return null;

    return power;
  }

  _formatPower(watts) {
    if (watts >= 1000) {
      return `${(watts / 1000).toFixed(2)} kW`;
    }
    return `${Math.round(watts)} W`;
  }

  /**
   * Get current outage status
   * Returns: { isActive: boolean, endTime: Date|null, minutesRemaining: number|null }
   */
  _getOutageStatus() {
    if (!this._config.outage_status_entity) {
      return { isActive: false, endTime: null, minutesRemaining: null, isUnavailable: false };
    }

    const statusSt = this.hass?.states?.[this._config.outage_status_entity];
    if (!statusSt) {
      return { isActive: false, endTime: null, minutesRemaining: null, isUnavailable: true };
    }

    // Check if outage is active (support various formats: on/off, true/false, active/inactive, outage/connected)
    const state = statusSt.state?.toLowerCase();
    const isActive = state === 'on' || state === 'true' || state === 'active' || state === '1' || state === 'outage';

    const isUnavailable = !state || state === 'unknown' || state === 'unavailable';
    let endTime = null;
    let minutesRemaining = null;

    if (isActive) {
      const endTimeSt = this._config.outage_end_time_entity
        ? this.hass?.states?.[this._config.outage_end_time_entity]
        : null;
      const endTimeValue = this._validEntityState(endTimeSt)
        ? endTimeSt.state
        : statusSt.attributes?.event_end;

      endTime = this._parseDateTime(endTimeValue);
      if (endTime) {
        minutesRemaining = Math.max(0, Math.round((endTime - new Date()) / 60000));
      }
    }

    return { isActive, endTime, minutesRemaining, isUnavailable };
  }

  /**
   * Get next scheduled outage information
   * Returns: { startTime: Date|null, minutesUntil: number|null, isUnavailable: boolean }
   */
  _getNextOutage() {
    if (!this._config.next_outage_time_entity) {
      return { startTime: null, minutesUntil: null, isUnavailable: false };
    }

    const nextOutageSt = this.hass?.states?.[this._config.next_outage_time_entity];
    if (!this._validEntityState(nextOutageSt)) {
      return { startTime: null, minutesUntil: null, isUnavailable: true };
    }

    const startTime = this._parseDateTime(nextOutageSt.state);
    if (!startTime) return { startTime: null, minutesUntil: null, isUnavailable: true };

    const minutesUntil = Math.max(0, Math.round((startTime - new Date()) / 60000));
    return { startTime, minutesUntil, isUnavailable: false };
  }

  _validEntityState(entityState) {
    const state = entityState?.state?.toLowerCase();
    return !!state && state !== 'unknown' && state !== 'unavailable';
  }

  _getOutageScheduleStatus() {
    if (!this._config.outage_schedule_status_entity) {
      return { isEmergency: false, hasNoOutages: false, isUnavailable: false };
    }

    const statusSt = this.hass?.states?.[this._config.outage_schedule_status_entity];
    if (!this._validEntityState(statusSt)) {
      return { isEmergency: false, hasNoOutages: false, isUnavailable: true };
    }

    return {
      isEmergency: statusSt.state.toLowerCase() === 'emergency_shutdowns',
      hasNoOutages: statusSt.state.toLowerCase() === 'no_outages',
      isUnavailable: false,
    };
  }

  /**
   * Parse datetime string (supports ISO format, timestamps, etc.)
   */
  _parseDateTime(value) {
    if (!value) return null;

    // Try parsing as ISO date
    let date = new Date(value);
    if (!isNaN(date.getTime())) return date;

    // Try parsing as Unix timestamp (seconds)
    const timestamp = Number(value);
    if (Number.isFinite(timestamp)) {
      date = new Date(timestamp * 1000);
      if (!isNaN(date.getTime())) return date;
    }

    return null;
  }

  /**
   * Analyze outage situation and provide recommendations
   * Returns: {
   *   sufficientForOutage: boolean|null,
   *   canChargeBeforeNext: boolean|null,
   *   warningLevel: 'critical'|'warning'|'info'|'ok',
   *   message: string
   * }
   */
  _analyzeOutageSituation() {
    const selectedIdx = this._config.selected_battery;
    const battery = this._config.batteries[selectedIdx];
    if (!battery) return { sufficientForOutage: null, canChargeBeforeNext: null, warningLevel: 'ok', message: '' };

    const outageStatus = this._getOutageStatus();
    const nextOutage = this._getNextOutage();
    const remainingTime = this._remainingTime(selectedIdx);
    const currentPct = this._pct(selectedIdx);

    let sufficientForOutage = null;
    let canChargeBeforeNext = null;
    let warningLevel = 'ok';
    let message = '';

    // Analysis 1: Current outage - is battery sufficient?
    if (outageStatus.isActive && outageStatus.minutesRemaining !== null) {
      if (remainingTime && remainingTime.type === 'discharge') {
        const dischargeMinutes = this._parseTimeToMinutes(remainingTime.time);
        sufficientForOutage = dischargeMinutes >= outageStatus.minutesRemaining;

        if (!sufficientForOutage) {
          warningLevel = 'critical';
          const shortfall = outageStatus.minutesRemaining - dischargeMinutes;
          message = `⚠️ ${battery.name || 'Battery'} may run out ${this._formatMinutes(shortfall)} before outage ends!`;
        } else {
          const excess = dischargeMinutes - outageStatus.minutesRemaining;
          if (excess < 30) {
            warningLevel = 'warning';
            message = `⚡ ${battery.name || 'Battery'} sufficient, but only ${this._formatMinutes(excess)} spare time`;
          } else {
            warningLevel = 'ok';
            message = `✅ ${battery.name || 'Battery'} sufficient for outage (${this._formatMinutes(excess)} spare)`;
          }
        }
      }
    }

    // Analysis 2: Next outage - can we charge enough?
    if (!outageStatus.isActive && nextOutage.minutesUntil !== null && battery.charge_remaining_time_entity) {
      // Get actual charge time from sensor
      const chargeSt = this.hass?.states?.[battery.charge_remaining_time_entity];
      if (chargeSt && chargeSt.state && chargeSt.state !== 'unknown' && chargeSt.state !== 'unavailable') {
        const chargeTimeNeeded = this._parseTimeValue(chargeSt.state);

        if (Number.isFinite(chargeTimeNeeded) && chargeTimeNeeded > 0) {
          canChargeBeforeNext = nextOutage.minutesUntil >= chargeTimeNeeded;

          if (currentPct < 80) {
            if (!canChargeBeforeNext) {
              warningLevel = warningLevel === 'critical' ? 'critical' : 'warning';
              message = message || `⚠️ Not enough time to fully charge ${battery.name || 'battery'} before next outage!`;
            } else {
              const timeMargin = nextOutage.minutesUntil - chargeTimeNeeded;
              if (timeMargin < 60 && warningLevel === 'ok') {
                warningLevel = 'info';
                message = message || `⏰ Start charging ${battery.name || 'battery'} soon - ${this._formatMinutes(timeMargin)} margin`;
              }
            }
          }
        }
      }
    }

    return { sufficientForOutage, canChargeBeforeNext, warningLevel, message };
  }

  /**
   * Parse time string like "2h 30m" or "45m" to minutes
   */
  _parseTimeToMinutes(timeStr) {
    if (!timeStr) return 0;

    let totalMinutes = 0;
    const hoursMatch = timeStr.match(/(\d+)h/);
    const minutesMatch = timeStr.match(/(\d+)m/);

    if (hoursMatch) totalMinutes += parseInt(hoursMatch[1]) * 60;
    if (minutesMatch) totalMinutes += parseInt(minutesMatch[1]);

    return totalMinutes;
  }

  /**
   * Format datetime for display
   */
  _formatDateTime(date) {
    if (!date) return '';

    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const isTomorrow = date.toDateString() === new Date(now.getTime() + 86400000).toDateString();

    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (isToday) return `Today ${timeStr}`;
    if (isTomorrow) return `Tomorrow ${timeStr}`;
    return date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  /**
   * Render status indicator square below battery (for vertical layout)
   */
  _renderVerticalStatusIndicator(centerX, centerY, color, isConnected, statusIcon, isCharging, isDischarging) {
    const fillColor = isConnected ? 'var(--success-color, #43a047)' : color;
    const squareSize = 36; // Size of the square
    const innerSquareSize = 30;

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'status-indicator-vertical');
    g.setAttribute('transform', `translate(${centerX}, ${centerY})`);

    // Outer square (border)
    const outerSquare = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    outerSquare.setAttribute('class', 'status-square-border-anim');
    outerSquare.setAttribute('x', -squareSize / 2);
    outerSquare.setAttribute('y', -squareSize / 2);
    outerSquare.setAttribute('width', squareSize);
    outerSquare.setAttribute('height', squareSize);
    outerSquare.setAttribute('rx', '5');
    outerSquare.setAttribute('ry', '5');
    outerSquare.setAttribute('fill', 'none');
    outerSquare.setAttribute('stroke', fillColor);
    outerSquare.setAttribute('stroke-width', '2');
    g.appendChild(outerSquare);

    // Inner square (filled)
    const innerSquare = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    innerSquare.setAttribute('class', 'status-square-fill-anim');
    innerSquare.setAttribute('x', -innerSquareSize / 2);
    innerSquare.setAttribute('y', -innerSquareSize / 2);
    innerSquare.setAttribute('width', innerSquareSize);
    innerSquare.setAttribute('height', innerSquareSize);
    innerSquare.setAttribute('rx', '3');
    innerSquare.setAttribute('ry', '3');
    innerSquare.setAttribute('fill', fillColor);
    g.appendChild(innerSquare);

    // Icon text
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', '0');
    text.setAttribute('y', '0');
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'central');
    text.setAttribute('font-size', '18');
    text.setAttribute('fill', 'white');
    text.setAttribute('font-weight', 'bold');
    text.textContent = statusIcon;

    if (isCharging) {
      text.setAttribute('class', 'status-icon-charging');
    } else if (isDischarging) {
      text.setAttribute('class', 'status-icon-discharging');
    } else if (isConnected) {
      text.setAttribute('class', 'status-icon-connected');
    }

    g.appendChild(text);

    return g;
  }

  /**
   * Render time text element programmatically (to avoid template escaping issues)
   */
  _renderTimeText(centerX, centerY, remainingTime) {
    if (!remainingTime) return '';

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', centerX);
    text.setAttribute('y', centerY);
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'central');
    text.setAttribute('class', 'time-text-square');
    text.setAttribute('fill', 'white');

    text.textContent = `${remainingTime.time}`;

    return text;
  }


  /**
   * Render a single vertical battery with all components
   * Returns HTML template for one battery column
   */
  _renderSingleBattery(batteryIndex) {
    const pct = this._pct(batteryIndex);
    const color = this._color(pct);
    const battery = this._config.batteries[batteryIndex];
    const remainingTime = this._remainingTime(batteryIndex);
    const acOutPower = this._acOutPower(batteryIndex);

    // Status determination
    const isCharging = remainingTime?.type === 'charge';
    const isDischarging = remainingTime?.type === 'discharge';
    const isConnected = !isCharging && !isDischarging && (battery.remaining_time_entity || battery.charge_remaining_time_entity);
    const statusIcon = isCharging ? '↑' : (isDischarging ? '↓' : (isConnected ? '⚡' : ''));

    return html`
      <div class="battery-column">
        <div class="battery-container">
          <!-- Circular battery with wave effect -->
          <div class="water-round-container" style="--fill-height: ${pct}%; --fill-color: ${color};">
            <div class="water-wave"></div>
          </div>
          
          <!-- Battery name -->
          <div class="battery-name-text">${battery.name || `Battery ${batteryIndex + 1}`}</div>
          
          <!-- Percentage text (centered in circle, upper portion) -->
          <div class="pct-circle-text">${pct.toFixed(this._config.precision)}%</div>
          
          <!-- Time info inside circle (below percentage) -->
          ${remainingTime ? html`
            <div class="time-circle-text">
              ${remainingTime.time}
            </div>
          ` : ''}
          
          <!-- Status indicator (positioned below the circle) -->
          <div class="status-indicator-wrapper">
            ${statusIcon ? html`
              <svg width="50" height="50" viewBox="0 0 50 50" class="status-svg">
                ${this._renderVerticalStatusIndicator(25, 25, color, isConnected, statusIcon, isCharging, isDischarging)}
              </svg>
            ` : ''}
          </div>
        </div>
        
        <!-- Power info below status indicator -->
        ${acOutPower && acOutPower > 0 ? html`
          <div class="battery-power-below">
            <span class="power-value-below">${this._formatPower(acOutPower)}</span>
          </div>
        ` : ''}
      </div>
    `;
  }

  render() {
    if (!this._config) return html``;

    const numBatteries = this._config.batteries.length;
    const outageStatus = this._getOutageStatus();
    const nextOutage = this._getNextOutage();
    const scheduleStatus = this._getOutageScheduleStatus();
    const analysis = this._analyzeOutageSituation();
    const hasOutageConfig = !!(
      this._config.outage_status_entity ||
      this._config.next_outage_time_entity ||
      this._config.outage_schedule_status_entity
    );
    const outageDataUnavailable = outageStatus.isUnavailable ||
      scheduleStatus.isUnavailable ||
      (!outageStatus.isActive && nextOutage.isUnavailable && !scheduleStatus.hasNoOutages);

    // Render all batteries
    const batteryElements = this._config.batteries.map((_, idx) =>
      this._renderSingleBattery(idx)
    );

    return html`
      <ha-card class="eco-card-vertical">
        <div
          class="batteries-container"
          data-count="${numBatteries}"
          data-density="${numBatteries >= 4 ? 'dense' : (numBatteries === 3 ? 'compact' : 'regular')}"
          style="--battery-columns: ${Math.min(numBatteries, 4)}"
        >
          ${batteryElements}
        </div>
        
        <!-- Outage information (for selected battery) -->
        ${hasOutageConfig ? html`<div class="outage-info-container">
          <!-- Outage Analysis Warning/Info -->
          ${analysis.message ? html`
            <div class="outage-analysis ${analysis.warningLevel}">
              <span class="analysis-message">${analysis.message}</span>
            </div>
          ` : ''}
          
          <!-- Current Outage Info (show only if active) -->
          ${outageStatus.isActive ? html`
            <div class="outage-compact">
              <div class="outage-compact-header">
                <span class="outage-icon">🔌</span>
                <span class="outage-label">Outage Active</span>
              </div>
              <div class="outage-compact-info">
                ${outageStatus.endTime ? html`
                  <span class="compact-label">Ends:</span>
                  <span class="compact-value">${this._formatDateTime(outageStatus.endTime)}</span>
                  <span class="compact-separator">•</span>
                  <span class="compact-label">Remaining:</span>
                  <span class="compact-value">${this._formatMinutes(outageStatus.minutesRemaining)}</span>
                ` : html`
                  <span class="compact-value-lg">End time unavailable</span>
                `}
              </div>
            </div>
          ` : ''}
          
          <!-- Emergency schedule status from Yasno v3 status sensor -->
          ${!outageStatus.isActive && scheduleStatus.isEmergency ? html`
            <div class="outage-compact outage-emergency">
              <div class="outage-compact-header">
                <span class="outage-icon">⚠️</span>
                <span class="outage-label">Emergency Outage Applied</span>
              </div>
              <div class="outage-compact-info">
                <span class="compact-value-lg">Scheduled outage information unavailable</span>
              </div>
            </div>
          ` : ''}
          
          <!-- Next Outage Info (show only if no active outage and not emergency) -->
          ${!outageStatus.isActive && !scheduleStatus.isEmergency && nextOutage.startTime ? html`
            <div class="outage-compact outage-next">
              <div class="outage-compact-header">
                <span class="outage-icon">📅</span>
                <span class="outage-label">Next Outage</span>
              </div>
              <div class="outage-compact-info">
                <span class="compact-value-lg">${this._formatDateTime(nextOutage.startTime)}</span>
                <span class="compact-separator">•</span>
                <span class="compact-label">In:</span>
                <span class="compact-value">${this._formatMinutes(nextOutage.minutesUntil)}</span>
              </div>
            </div>
          ` : ''}

          ${outageDataUnavailable && !scheduleStatus.isEmergency ? html`
            <div class="outage-compact outage-unavailable">
              <div class="outage-compact-header">
                <span class="outage-icon">⚠️</span>
                <span class="outage-label">Outage data unavailable</span>
              </div>
              <div class="outage-compact-info">
                <span class="compact-value-lg">Check the configured entity IDs in Home Assistant.</span>
              </div>
            </div>
          ` : ''}
        </div>` : ''}
      </ha-card>
    `;
  }

  static get styles() {
    return css`
      /* Vertical battery layout */
      ha-card.eco-card-vertical { padding: 16px; }
      .batteries-container {
        --battery-size: 140px;
        --status-size: 50px;
        --pct-top: 70px;
        --time-top: 120px;
        --pct-font-size: 38px;
        --time-font-size: 20px;
        display: grid;
        grid-template-columns: repeat(var(--battery-columns, 1), minmax(0, 1fr));
        align-items: start;
        gap: clamp(8px, 3vw, 28px);
        margin-bottom: 12px;
        container-type: inline-size;
      }
      .batteries-container[data-count="3"] {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
      .batteries-container[data-density="compact"] {
        --battery-size: 96px;
        --status-size: 36px;
        --pct-top: 55px;
        --time-top: 88px;
        --pct-font-size: 24px;
        --time-font-size: 13px;
        --battery-size: clamp(72px, 29cqw, 108px);
        --status-size: clamp(30px, 10cqw, 40px);
        --pct-top: clamp(48px, 16cqw, 60px);
        --time-top: clamp(75px, 27cqw, 98px);
        --pct-font-size: clamp(20px, 8cqw, 27px);
        --time-font-size: clamp(11px, 4cqw, 14px);
        gap: clamp(4px, 2cqw, 10px);
      }
      .batteries-container[data-density="dense"] {
        --battery-size: 96px;
        --status-size: 38px;
        --pct-top: 57px;
        --time-top: 92px;
        --pct-font-size: 24px;
        --time-font-size: 13px;
      }
      .battery-column {
        display: -webkit-box;
        display: -webkit-flex;
        display: flex;
        -webkit-box-orient: vertical;
        -webkit-box-direction: normal;
        -webkit-flex-direction: column;
        flex-direction: column;
        -webkit-box-align: center;
        -webkit-align-items: center;
        align-items: center;
        gap: 8px;
        min-width: 0;
      }
      .battery-container {
        position: relative;
        width: min(100%, calc(var(--battery-size) + 12px));
        margin: 0 auto;
        padding-top: 30px;
      }
      .water-round-container {
        margin: 0 auto;
        overflow: hidden;
        position: relative;
        width: min(100%, var(--battery-size));
        height: auto;
        aspect-ratio: 1;
        box-sizing: border-box;
        border-radius: 50%;
        border: 2px solid rgba(255, 255, 255, 0.3);
        background: rgba(50, 50, 50, 0.3);
        box-shadow: 0 0 10px rgba(0, 0, 0, 0.3);
      }
      .water-wave {
        position: absolute;
        top: calc(100% - var(--fill-height, 0%));
        left: -45%;
        background: var(--fill-color);
        opacity: 0.9;
        width: 200%;
        height: 200%;
        border-radius: 40%;
        -webkit-animation: water-waves 8s linear infinite;
        animation: water-waves 8s linear infinite;
        filter: drop-shadow(0 0 8px var(--fill-color)) drop-shadow(0 0 4px var(--fill-color));
        transition: top 0.5s ease;
      }
      .battery-name-text {
        position: absolute;
        top: 5px;
        left: 50%;
        transform: translateX(-50%);
        font-size: clamp(12px, 3vw, 16px);
        font-weight: 600;
        color: var(--primary-text-color);
        white-space: nowrap;
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        pointer-events: none;
      }
      .pct-circle-text {
        position: absolute;
        top: var(--pct-top);
        left: 50%;
        transform: translateX(-50%);
        color: white;
        font-weight: 700;
        font-size: var(--pct-font-size);
        text-shadow: 0 0 6px rgba(0,0,0,0.95), 0 0 10px rgba(0,0,0,0.8), 0 0 3px rgba(0,0,0,1);
        filter: drop-shadow(0 0 4px rgba(255,255,255,0.5));
        pointer-events: none;
      }
      .time-circle-text {
        position: absolute;
        top: var(--time-top);
        left: 50%;
        transform: translateX(-50%);
        color: white;
        font-weight: 600;
        font-size: var(--time-font-size);
        text-shadow: 0 0 6px rgba(0,0,0,0.95), 0 0 10px rgba(0,0,0,0.8), 0 0 3px rgba(0,0,0,1);
        filter: drop-shadow(0 0 3px rgba(255,255,255,0.4));
        pointer-events: none;
        white-space: nowrap;
      }
      .status-indicator-wrapper {
        position: relative;
        height: var(--status-size);
        display: -webkit-box;
        display: -webkit-flex;
        display: flex;
        -webkit-box-pack: center;
        -webkit-justify-content: center;
        justify-content: center;
        -webkit-box-align: center;
        -webkit-align-items: center;
        align-items: center;
        margin-top: 8px;
      }
      .status-svg {
        display: block;
        width: var(--status-size);
        height: var(--status-size);
        filter: drop-shadow(0 0 4px rgba(0,0,0,0.3));
      }
      .battery-power-below {
        display: -webkit-box;
        display: -webkit-flex;
        display: flex;
        -webkit-box-pack: center;
        -webkit-justify-content: center;
        justify-content: center;
        margin-top: 8px;
      }
      .power-value-below {
        font-weight: 700;
        font-size: clamp(14px, 3.5vw, 18px);
        color: var(--success-color, #43a047);
        text-shadow: 0 0 8px rgba(67, 160, 71, 0.6);
      }
      
      /* Responsive adjustments for smaller screens */
      @media (max-width: 600px) {
        .batteries-container {
          gap: 8px;
        }
        .batteries-container[data-density="compact"] {
          gap: 4px;
        }
        ha-card.eco-card-vertical {
          padding: 12px;
        }
      }
      
      @media (max-width: 400px) {
        .batteries-container {
          gap: 6px;
        }
        .batteries-container[data-density="compact"] {
          --battery-size: 82px;
          --status-size: 34px;
          --pct-top: 52px;
          --time-top: 82px;
          --pct-font-size: 21px;
          --time-font-size: 12px;
        }
        .batteries-container[data-density="dense"] {
          --battery-size: 64px;
          --status-size: 30px;
          --pct-top: 48px;
          --time-top: 70px;
          --pct-font-size: 18px;
          --time-font-size: 10px;
        }
      }
      .battery-time, .battery-power {
        display: -webkit-box;
        display: -webkit-flex;
        display: flex;
        -webkit-box-align: center;
        -webkit-align-items: center;
        align-items: center;
        gap: 5px;
        font-size: 13px;
        color: var(--secondary-text-color);
      }
      .time-icon-small {
        font-size: 14px;
        opacity: 0.8;
      }
      .time-value-small {
        font-weight: 600;
        color: var(--primary-text-color);
      }
      .power-value-small {
        font-weight: 700;
        color: var(--success-color, #43a047);
        font-size: 14px;
      }
      .outage-info-container {
        margin-top: 12px;
        clear: both;
      }
      
      /* Old horizontal layout styles (keep for compatibility) */
      .wrap { display: grid; place-items: center; padding: 0; }
      ha-card.eco-card { padding: 2px 8px 2px; }
      svg { width: 100%; max-width: 300px; height: auto; }
      .case { fill: none; stroke: var(--primary-text-color); stroke-width: 3; opacity: 0.85; }
      .cap { fill: var(--primary-text-color); opacity: 0.8; }
      .inner-bg { fill: #000000; stroke: var(--divider-color); stroke-width: 0; }
      .segment { transition: opacity 250ms ease, fill 250ms ease; }
      .pct { 
        fill: var(--primary-text-color); 
        font-weight: 700; 
        font-size: 18px; 
        text-shadow: 0 0 4px rgba(0,0,0,0.8), 0 0 8px rgba(0,0,0,0.6);
        filter: drop-shadow(0 0 2px rgba(255,255,255,0.3));
      }
      .remaining-time {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        margin-top: -55px;
        padding: 0px 0px;
        background: var(--card-background-color, rgba(255,255,255,0.05));
        border-radius: 12px;
        font-size: 40px;
        color: var(--primary-text-color);
        opacity: 0.95;
      }
      .time-icon {
        font-size: 40px;
        color: white;
        filter: brightness(0) invert(1);
        opacity: 0.85;
      }
      .time-value {
        font-weight: 600;
        font-size: 40px;
      }
      .power-output {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        margin-top: 2px;
        padding: 2px 16px;
        background: var(--card-background-color, rgba(255,255,255,0.05));
        border-radius: 12px;
        font-size: 24px;
        color: var(--primary-text-color);
        opacity: 0.95;
      }
      .power-icon {
        font-size: 28px;
        color: white;
        filter: brightness(0) invert(1);
        opacity: 0.9;
        animation: pulse 1.5s ease-in-out infinite;
      }
      .power-label {
        font-size: 18px;
        font-weight: 500;
        opacity: 0.8;
      }
      .power-value {
        font-weight: 700;
        font-size: 28px;
        color: var(--success-color, #43a047);
      }
      .energy-flow {
        opacity: 0.9;
      }
      .flow-particle-static {
        filter: drop-shadow(0 0 3px currentColor);
        animation: flowWave 1.5s ease-in-out infinite;
      }
      .status-indicator {
        filter: drop-shadow(0 0 4px rgba(0,0,0,0.5));
      }
      .status-square-border-anim {
        opacity: 0.6;
        animation: squareBorderPulse 1.5s ease-in-out infinite;
      }
      .status-square-fill-anim {
        opacity: 0.9;
        animation: squareFillPulse 1.5s ease-in-out infinite;
      }
      .status-icon-charging {
        filter: brightness(0) invert(1);
        user-select: none;
        pointer-events: none;
      }
      .status-icon-discharging {
        filter: brightness(0) invert(1);
        user-select: none;
        pointer-events: none;
      }
      .status-icon-connected {
        filter: brightness(0) invert(1);
        user-select: none;
        pointer-events: none;
      }
      @keyframes pulse {
        0%, 100% { opacity: 0.9; transform: scale(1); }
        50% { opacity: 1; transform: scale(1.1); }
      }
      @keyframes flowWave {
        0%, 100% { 
          opacity: 0.2;
        }
        50% { 
          opacity: 0.85;
        }
      }
      @keyframes squareBorderPulse {
        0%, 100% { opacity: 0.6; transform: scale(1); }
        50% { opacity: 0.3; transform: scale(1.15); }
      }
      @keyframes squareFillPulse {
        0%, 100% { opacity: 0.9; }
        50% { opacity: 1; }
      }
      @keyframes water-waves {
        0% {
          transform: rotate(0deg);
        }
        100% {
          transform: rotate(360deg);
        }
      }
      @-webkit-keyframes water-waves {
        0% {
          -webkit-transform: rotate(0deg);
        }
        100% {
          -webkit-transform: rotate(360deg);
        }
      }
      @keyframes bounceUp {
        0%, 100% { transform: translateY(1.5px); }
        50% { transform: translateY(-1.5px); }
      }
      @keyframes bounceDown {
        0%, 100% { transform: translateY(-1.5px); }
        50% { transform: translateY(1.5px); }
      }
      @keyframes scaleIcon {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.3); }
      }
      
      /* Outage Analysis Styles */
      .outage-analysis {
        display: -webkit-box;
        display: -webkit-flex;
        display: flex;
        -webkit-box-align: center;
        -webkit-align-items: center;
        align-items: center;
        -webkit-box-pack: center;
        -webkit-justify-content: center;
        justify-content: center;
        padding: 6px 12px;
        margin-top: 6px;
        border-radius: 6px;
        font-size: 13px;
        font-weight: 600;
        text-align: center;
        box-sizing: border-box;
      }
      .outage-analysis.critical {
        background: var(--error-color, #e53935);
        color: white;
        -webkit-animation: alertPulse 2s ease-in-out infinite;
        animation: alertPulse 2s ease-in-out infinite;
      }
      .outage-analysis.warning {
        background: var(--warning-color, #fbc02d);
        color: #333;
      }
      .outage-analysis.info {
        background: var(--info-color, #2196f3);
        color: white;
      }
      .outage-analysis.ok {
        background: var(--success-color, #43a047);
        color: white;
      }
      .analysis-message {
        line-height: 1.4;
        word-break: break-word;
      }
      
      /* Compact Outage Styles */
      .outage-compact {
        background: var(--card-background-color, rgba(255,255,255,0.05));
        border: 2px solid var(--error-color, #e53935);
        border-radius: 8px;
        padding: 8px 12px;
        margin-top: 6px;
        box-sizing: border-box;
      }
      .outage-compact.outage-next {
        border-color: var(--info-color, #2196f3);
      }
      .outage-compact.outage-emergency {
        border-color: var(--warning-color, #fbc02d);
        background: rgba(251, 192, 45, 0.1);
      }
      .outage-compact.outage-unavailable {
        border-color: var(--warning-color, #fbc02d);
      }
      .outage-compact-header {
        display: -webkit-box;
        display: -webkit-flex;
        display: flex;
        -webkit-box-align: center;
        -webkit-align-items: center;
        align-items: center;
        gap: 6px;
        margin-bottom: 4px;
        font-size: 14px;
        font-weight: 700;
        color: var(--primary-text-color);
      }
      .outage-icon {
        font-size: 16px;
        line-height: 1;
      }
      .outage-label {
        -webkit-box-flex: 1;
        -webkit-flex: 1;
        flex: 1;
      }
      .outage-compact-info {
        display: -webkit-box;
        display: -webkit-flex;
        display: flex;
        -webkit-box-align: center;
        -webkit-align-items: center;
        align-items: center;
        -webkit-flex-wrap: wrap;
        flex-wrap: wrap;
        gap: 6px;
        font-size: 12px;
        line-height: 1.5;
      }
      .compact-label {
        color: var(--secondary-text-color, #9b9b9b);
        font-weight: 500;
      }
      .compact-value {
        color: var(--primary-text-color, #e1e1e1);
        font-weight: 600;
      }
      .compact-value-lg {
        color: var(--primary-text-color, #e1e1e1);
        font-weight: 700;
        font-size: 13px;
      }
      .compact-separator {
        color: var(--divider-color, #383838);
        opacity: 0.6;
        -webkit-user-select: none;
        user-select: none;
      }
      
      /* Alert Pulse Animation */
      @-webkit-keyframes alertPulse {
        0%, 100% { 
          opacity: 1;
          box-shadow: 0 0 0 0 var(--error-color, #e53935);
        }
        50% { 
          opacity: 0.85;
          box-shadow: 0 0 20px 5px rgba(229, 57, 53, 0.4);
        }
      }
      @keyframes alertPulse {
        0%, 100% { 
          opacity: 1;
          box-shadow: 0 0 0 0 var(--error-color, #e53935);
        }
        50% { 
          opacity: 0.85;
          box-shadow: 0 0 20px 5px rgba(229, 57, 53, 0.4);
        }
      }
    `;
  }

  static getStubConfig() {
    return {
      batteries: [
        { entity: 'sensor.battery_level', name: 'EcoFlow Delta 2' }
      ],
      selected_battery: 0
    };
  }
}

if (!customElements.get('smart-battery-card')) {
  customElements.define('smart-battery-card', SmartBatteryCard);
}

console.info('%c SMART-BATTERY-CARD %c v0.5.1 ', 'background:#0b8043;color:white;border-radius:3px 0 0 3px;padding:2px 4px', 'background:#263238;color:#fff;border-radius:0 3px 3px 0;padding:2px 4px');
