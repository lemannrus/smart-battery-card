# Changelog

All notable changes to the Smart Battery Card will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.1] - 2026-08-21

### Fixed

- Scale three-battery circles, labels, time, and status indicators with the available card width
- Keep three batteries in one explicit row on narrow tablet dashboard columns
- Reduce compact tablet gaps and prevent horizontal overflow
- Add fixed-size fallbacks for WebViews without container query unit support

## [0.5.0] - 2026-08-21

### Added
- Compact responsive rows for three and four batteries.
- Yasno v3 `status_today` support via `outage_schedule_status_entity`.
- Visible warning when configured outage entities are missing or unavailable.

### Changed
- Active outage end time now falls back to the electricity sensor's `event_end` attribute.
- An `unknown` next-outage sensor is treated as unavailable data, not as proof of an emergency outage.
- Documentation now reflects address-based Yasno v3 setup and separates the card's summary from the integration's calendar graph.

## [0.4.0] - 2025-11-14

### 🎉 Rebranding

#### Name Change
- **Renamed Project**: "EcoFlow Battery Card" → "Smart Battery Card"
  - More generic name reflects universal battery support
  - Works with any battery sensor: EcoFlow, Jackery, Tesla Powerwall, etc.
  - Custom element renamed: `custom:eco-battery-card` → `custom:smart-battery-card`
  - File renamed: `eco-battery-card.js` → `smart-battery-card.js`

### ⚠️ Breaking Changes
- **Custom Element Name**: You must update your configuration from `type: custom:eco-battery-card` to `type: custom:smart-battery-card`
- **File Name**: Update HACS or manual installation to use `smart-battery-card.js`

## [0.3.0] - 2025-11-13

### ✨ Major Features - Multi-Battery Support

#### Vertical Battery Layout
- **Complete UI Redesign**: Batteries now display vertically with bottom-to-top fill
  - Battery segments fill from bottom like real batteries charging
  - Each battery has its own status circle below
  - Battery names displayed at the top of each unit
  - Clean, minimal design with no distracting animations
  
#### Multi-Battery Display
- **Support for Multiple Batteries**: Add as many EcoFlow devices as you want!
  - Dynamic layout that auto-adjusts based on battery count:
    - 1 battery: Centered display
    - 2 batteries: Left and right placement
    - 3+ batteries: Distributed grid layout
  - Each battery shows independently:
    - Battery name
    - Percentage level
    - Remaining time (charge or discharge)
    - Power output
    - Status indicator (charging/discharging/idle)
  - Auto-adjusting card height for optimal display

#### Selected Battery Analysis
- **Outage Analysis Selection**: Choose which battery to monitor for outages
  - New `selected_battery` config option (0 = first, 1 = second, etc.)
  - Outage warnings reference the battery by name
  - Example: "⚠️ Delta 2 may run out before outage ends"
  - Unified outage display for all batteries

### 🔄 Breaking Changes

⚠️ **Configuration Structure Changed**

**Old Format (v0.2.x):**
```yaml
entity: sensor.battery_level
name: My Battery
remaining_time_entity: sensor.discharge_time
```

**New Format (v0.3.0+):**
```yaml
batteries:
  - entity: sensor.battery_level
    name: My Battery
    remaining_time_entity: sensor.discharge_time
```

**Migration**: Simply wrap your battery configuration in a `batteries` array!

#### Removed Options
- `charge_rate_watts`: No longer needed (card uses sensor directly)
- `battery_capacity_wh`: No longer needed (card uses sensor directly)
- `outage_schedule_entity`: Already removed in v0.2.1

### 📝 Changed

#### Configuration
- **New Structure**: `batteries` array replaces single `entity` config
- **Battery Object Properties**: Each battery has its own config:
  - `entity` (required): Battery level sensor
  - `name` (optional): Display name
  - `remaining_time_entity` (optional): Discharge time
  - `charge_remaining_time_entity` (optional): Charge time
  - `ac_out_power_entity` (optional): Power output
  - `invert` (optional): Invert reading
  
#### Visual Design
- Battery orientation: horizontal → vertical
- Fill direction: left-to-right → bottom-to-top
- Status indicator: right side → below battery
- Layout: single horizontal → dynamic multi-battery
- Energy flow animations: removed for cleaner, more minimal design

#### Internal Improvements
- Refactored `render()` method for multi-battery support
- New helper methods:
  - `_renderSingleBattery()`: Renders individual battery
  - `_renderVerticalEnergyFlow()`: Downward particle animation
  - `_renderVerticalStatusIndicator()`: Status circle below battery
- Updated `getCardSize()` to dynamically adjust based on battery count
- Modified `_pct()`, `_remainingTime()`, `_acOutPower()` to accept battery index
- Updated `_analyzeOutageSituation()` to use selected battery

### 🎨 Improved

#### Mobile Compatibility
- All CSS now has `-webkit-` prefixes for iOS Safari compatibility
- Flexbox properties properly prefixed
- Animations work smoothly on mobile devices
- Better layout handling with `box-sizing: border-box`
- Text wrapping with `word-break: break-word`

#### CSS & Animations
- New `.eco-card-vertical` class for vertical layout
- New `.batteries-container` for multi-battery flex layout
- New `.battery-column` for individual battery containers
- New `.battery-svg` for vertical battery SVG display
- New `.battery-name` for displaying battery names
- Updated animations with webkit prefixes:
  - `@-webkit-keyframes` for iOS
  - `-webkit-animation` properties
  - `-webkit-user-select` for text selection
- Compact time/power display styles
- Removed energy flow animations for cleaner design

### 📚 Documentation

#### README Updates
- Updated features section with v0.3.0 highlights
- New "Multi-Battery Support" section
- Updated configuration examples for all scenarios:
  - Single battery (basic)
  - Single battery with outage monitoring
  - Multi-battery configuration
- Updated configuration options table:
  - New "Card-Level Options" section
  - New "Battery Object" properties table
- Added migration guide from v0.2.x
- Updated all code examples

#### Example Config
- Completely rewritten `example-config.yaml`
- Added single battery examples
- Added multi-battery examples (2-3 batteries)
- Comprehensive configuration explanations
- Migration guide from v0.2.x
- Updated Yasno integration examples
- Troubleshooting section for multi-battery

### 🧪 Testing

#### Test Page Updates
- Updated `test.html` for v0.3.0
- New multi-battery test section
- All test configurations updated to new format:
  - Single battery tests (discharge/charge/connected)
  - Multi-battery scenarios
- Enhanced mock HASS object with multiple battery entities:
  - `sensor.river_2_battery`
  - `sensor.delta_2_battery`
  - `sensor.delta_pro_battery`
- Added 2-battery and 3-battery test cases

### 🔧 Technical Details

#### New Methods
- `_renderVerticalStatusIndicator(centerX, centerY, color, ...)`: Renders status circle
- `_renderSingleBattery(batteryIndex)`: Comprehensive single battery renderer

#### Modified Methods
- `setConfig()`: Now validates `batteries` array and `selected_battery`
- `render()`: Complete rewrite for multi-battery dynamic layout
- `getCardSize()`: Returns dynamic size based on battery count
- `_pct(batteryIndex)`: Accepts index for specific battery
- `_remainingTime(batteryIndex)`: Accepts index for specific battery
- `_acOutPower(batteryIndex)`: Accepts index for specific battery
- `_analyzeOutageSituation()`: Uses `selected_battery` index

#### Removed Methods
- `_friendlyName()`: Name now part of battery config
- `_calculateChargeTime()`: Charge time now from sensor

### 🐛 Bug Fixes
- Fixed CSS rendering issues on mobile devices
- Fixed webkit compatibility for iOS Safari
- Fixed energy flow animation timing
- Fixed status indicator positioning in vertical layout

### ⚡ Performance
- Optimized SVG rendering for multiple batteries
- Improved layout calculation algorithm
- Better memory usage with indexed battery access
- Efficient CSS with proper specificity

### 🎯 Future Considerations
- Battery selector UI (clickable to change selected)
- Aggregated battery view option
- Battery grouping/organization
- Per-battery outage analysis
- Battery comparison view

---

## [0.2.0] - 2025-11-13

### Added 🎉

#### Outage Management System
- **Smart Outage Analysis**: Intelligent monitoring and recommendations for power outages
  - Compares battery remaining time vs outage duration
  - Calculates if you can fully charge before next outage
  - Color-coded alerts: Critical (red), Warning (yellow), Info (blue), OK (green)
  
- **Current Outage Display**: Shows active outage information
  - Outage end time with smart formatting (Today/Tomorrow/Date)
  - Time remaining until power returns
  - Battery sufficiency analysis and warnings
  
- **Next Outage Preview**: Helps prepare for scheduled outages
  - Next outage start time display
  - Countdown to next outage
  - Required charging time calculation with analysis
  
- **Outage Schedule Display**: View complete outage schedule
  - Supports both plain text and JSON formats
  - Perfect for scheduled/rolling blackouts
  - Collapsible schedule view
  
- **Automated Recommendations**: Get actionable insights
  - "⚠️ Battery may run out before outage ends!" (Critical)
  - "⚡ Battery sufficient, but only Xm spare time" (Warning)
  - "⏰ Start charging soon - limited time margin" (Info)
  - "✅ Battery sufficient for outage" (OK)

#### New Configuration Options
- `outage_status_entity`: Current outage status sensor (supports: on/off, true/false, active/inactive, 1/0)
- `outage_end_time_entity`: When current outage will end (ISO datetime or Unix timestamp)
- `next_outage_time_entity`: When next outage starts (ISO datetime or Unix timestamp)
- `outage_schedule_entity`: Outage schedule information (text or JSON)
- `charge_rate_watts`: Charging power in watts for accurate time calculations (default: 1000)
- `battery_capacity_wh`: Battery capacity in watt-hours for accurate calculations (default: 1024)

### Changed 📝
- Updated card version display to v0.2.0
- Enhanced documentation with comprehensive outage setup guide
- Improved README with detailed configuration examples

### Technical Details 🔧
- Added 11 new methods for outage analysis and time calculations
- Implemented intelligent datetime parsing (supports ISO format and Unix timestamps)
- Added charging time calculation based on battery specs
- Created comprehensive analysis logic for outage situations
- Implemented smart formatting for dates (Today/Tomorrow/Full date)
- Added CSS animations for critical alerts (pulsing red background)

### Documentation 📚
- Created `example-config.yaml` with multiple configuration scenarios
- Added extensive outage integration setup guide in README
- Included template sensor examples for:
  - Simple scheduled outages
  - External API integration
  - DTEK (Ukrainian energy provider) integration
- Added troubleshooting section for outage features
- Included battery specifications for common EcoFlow models

### Testing 🧪
- Created `test-outage.html` for interactive testing of outage features
- Added 4 preset scenarios:
  - Normal Operation
  - Active Outage - Sufficient
  - Active Outage - Critical
  - Charging Before Outage

## [0.1.26] - Previous Version

### Features
- Visual battery display with segmented columns
- Animated status indicator (charging/discharging/connected)
- Energy flow animation
- Real-time power display
- Smart time display (discharge/charge)
- Configurable thresholds and color palettes
- Theme integration
- HACS compatible

---

## Migration Guide

### From v0.1.x to v0.2.0

Version 0.2.0 is **fully backward compatible**. All existing configurations will continue to work without any changes.

#### To Enable Outage Features:

1. **Create outage sensors** in your Home Assistant configuration (see README for examples)

2. **Add outage entities** to your card configuration:
```yaml
outage_status_entity: sensor.outage_status
outage_end_time_entity: sensor.outage_end_time
next_outage_time_entity: sensor.next_outage_time
outage_schedule_entity: sensor.outage_schedule
```

3. **Configure battery specs** (optional, for accurate calculations):
```yaml
charge_rate_watts: 1200  # Your charger's wattage
battery_capacity_wh: 1024  # Your battery's capacity
```

That's it! The card will automatically show outage information when configured.

---

## Future Plans 🚀

Potential features for future releases:
- Multiple outage schedule support
- Historical outage data visualization
- Predictive battery optimization suggestions
- Integration with weather forecasts for solar charging
- Mobile notifications for critical situations
- Customizable alert thresholds
- Support for multiple batteries

---

## Support

For issues, feature requests, or questions:
- GitHub Issues: [Create an issue](https://github.com/lemannrus/ecoflow-battery-card/issues)
- Documentation: See README.md
- Examples: See example-config.yaml

---

*Made with ❤️ for the Home Assistant community*
