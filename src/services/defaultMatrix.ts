

import type { CanMatrix } from '../types';

// This matrix is derived from the user-provided PDF.
// It serves as the default for decoding uploaded log files.
// Message IDs are stored as decimal strings.
// Defaulting to little-endian (Intel) format based on user feedback.

export const defaultMatrix: CanMatrix = {
    "405274497": { // 0X1827FF81
        name: "MCU_Faults",
        dlc: 8,
        signals: {
            "Odometer": { name: "Odometer", startBit: 32, length: 32, isLittleEndian: true, isSigned: false, scale: 0.1, offset: 0, min: 0, max: 0, unit: "Kms" },  
        }
    },
    "272170832": { // 0X1038FF50
        name: "Battery_Faults",
        dlc: 8,
        signals: {
             "Battery Cutoff Low Voltage Fault": { name: "Battery Cutoff Low Voltage Fault", startBit: 8, length: 1, isLittleEndian: true, isSigned: false, scale: 1, offset: 0, min: 0, max: 1, unit: "" },
             "Output Voltage Failur Fault": { name: "Output Voltage Failure Fault", startBit: 9, length: 1, isLittleEndian: true, isSigned: false, scale: 1, offset: 0, min: 0, max: 1, unit: "" },
             "Battery Internal Fault": { name: "Battery Internal Fault", startBit: 10, length: 1, isLittleEndian: true, isSigned: false, scale: 1, offset: 0, min: 0, max: 1, unit: "" },
             "Positive Busbar High Temperature Fault": { name: "Positive Busbar High Temperature Fault", startBit: 11, length: 1, isLittleEndian: true, isSigned: false, scale: 1, offset: 0, min: 0, max: 1, unit: "" },
             "Negative Busbar HIgh Temperature Fault": { name: "Negative Busbar HIgh Temperature Fault", startBit: 12, length: 1, isLittleEndian: true, isSigned: false, scale: 1, offset: 0, min: 0, max: 1, unit: "" },
             "Positive Busbar Over Temperature Fault": { name: "Positive Busbar Over Temperature Fault", startBit: 13, length: 1, isLittleEndian: true, isSigned: false, scale: 1, offset: 0, min: 0, max: 1, unit: "" },
             "Negative Busbar Over Temperature Fault": { name: "Negative Busbar Over Temperature Fault", startBit: 14, length: 1, isLittleEndian: true, isSigned: false, scale: 1, offset: 0, min: 0, max: 1, unit: "" },
             "Low SOC During Keyon Fault": { name: "Low SOC During Keyon Fault", startBit: 15, length: 1, isLittleEndian: true, isSigned: false, scale: 1, offset: 0, min: 0, max: 1, unit: "" },
             "Low SOC During Drive Fault": { name: "Low SOC During Drive Fault", startBit: 16, length: 1, isLittleEndian: true, isSigned: false, scale: 1, offset: 0, min: 0, max: 1, unit: "" },
             "Permanent Doc PosTemp Fault": { name: "Permanent Doc PosTemp Fault", startBit: 17, length: 1, isLittleEndian: true, isSigned: false, scale: 1, offset: 0, min: 0, max: 1, unit: "" },
             "Permanent Dco NegTemp Fault": { name: "Permanent Doc NegTemp Fault", startBit: 18, length: 1, isLittleEndian: true, isSigned: false, scale: 1, offset: 0, min: 0, max: 1, unit: "" },
             "TCU Communication Fault": { name: "TCU Communication Fault", startBit: 19, length: 1, isLittleEndian: true, isSigned: false, scale: 1, offset: 0, min: 0, max: 1, unit: "" },
             "Battery LowVoltage Fault": { name: "Battery LowVoltage Fault", startBit: 7, length: 1, isLittleEndian: true, isSigned: false, scale: 1, offset: 0, min: 0, max: 1, unit: "" },
             "Battery OverVoltage Fault": { name: "Battery OverVoltage Fault", startBit: 6, length: 1, isLittleEndian: true, isSigned: false, scale: 1, offset: 0, min: 0, max: 1, unit: "" },
             "Battery Cutoff OveVoltage Fault": { name: "Battery Cutoff OveVoltage Fault", startBit: 5, length: 1, isLittleEndian: true, isSigned: false, scale: 1, offset: 0, min: 0, max: 1, unit: "" },
             "Battery Low Temp Cutoff Fault": { name: "Battery Low Temp Cutoff Fault", startBit: 4, length: 1, isLittleEndian: true, isSigned: false, scale: 1, offset: 0, min: 0, max: 1, unit: "" },
             "BatteryLowTempFault": { name: "Battery Low Temp Fault", startBit: 3, length: 1, isLittleEndian: true, isSigned: false, scale: 1, offset: 0, min: 0, max: 1, unit: "" },
             "Battery High Temp Cutoff Fault": { name: "Battery High Temp Cutoff Fault", startBit: 2, length: 1, isLittleEndian: true, isSigned: false, scale: 1, offset: 0, min: 0, max: 1, unit: "" },
             "Battery High Temp Fault": { name: "Battery High Temp Fault", startBit: 1, length: 1, isLittleEndian: true, isSigned: false, scale: 1, offset: 0, min: 0, max: 1, unit: "" },
             "Battery Fault": { name: "Battery Fault", startBit: 0, length: 1, isLittleEndian: true, isSigned: false, scale: 1, offset: 0, min: 0, max: 1, unit: "" },
            
        }
    },
    "405819456": { // 0X18305040
        name: "MCU_Faults",
        dlc: 8,
        signals: {
            "Controller Fault": { name: "Controller Fault", startBit: 0, length: 1, isLittleEndian: true, isSigned: false, scale: 1, offset: 0, min: 0, max: 1, unit: "" },
            "Controller OverCurrent Fault": { name: "Controller Overcurrent Fault", startBit: 1, length: 1, isLittleEndian: true, isSigned: false, scale: 1, offset: 0, min: 0, max: 1, unit: "" },
            "Current Sensor Fault": { name: "Current Sensor Fault", startBit: 2, length: 1, isLittleEndian: true, isSigned: false, scale: 1, offset: 0, min: 0, max: 1, unit: "" },
            "Precharge Fault": { name: "Precharge Fault", startBit: 3, length: 1, isLittleEndian: true, isSigned: false, scale: 1, offset: 0, min: 0, max: 1, unit: "" },
            "Controller ServerUndertemp fault": { name: "Controller ServerUndertemp", startBit: 4, length: 1, isLittleEndian: true, isSigned: false, scale: 1, offset: 0, min: 0, max: 1, unit: "" },
            "Controller Severe Overtemp Fault": { name: "Controller Severe Overtemp Fault", startBit: 5, length: 1, isLittleEndian: true, isSigned: false, scale: 1, offset: 0, min: 0, max: 1, unit: "" },
            "Severe B+ Undervltage Fault": { name: "Severe B+ Undervltage Fault", startBit: 6, length: 1, isLittleEndian: true, isSigned: false, scale: 1, offset: 0, min: 0, max: 1, unit: "" },
            "Severe KSI Undervoltage Fault": { name: "Severe KSI Undervoltage Fault", startBit: 7, length: 1, isLittleEndian: true, isSigned: false, scale: 1, offset: 0, min: 0, max: 1, unit: "" },
            "Severe B+ OverVoltage Fault": { name: "Severe B+ OverVoltage Fault", startBit: 8, length: 1, isLittleEndian: true, isSigned: false, scale: 1, offset: 0, min: 0, max: 1, unit: "" },
            "Severe KSI Overvoltage Fault": { name: "Severe KSI OverVoltage Fault", startBit: 9, length: 1, isLittleEndian: true, isSigned: false, scale: 1, offset: 0, min: 0, max: 1, unit: "" },
            "Controller Over TempCutback Fault": { name: "Controller Over TempCutback Fault", startBit: 10, length: 1, isLittleEndian: true, isSigned: false, scale: 1, offset: 0, min: 0, max: 1, unit: "" },
            "B+ Undervoltage Cutback Fault": { name: "B+ Undervoltage Cutback Fault", startBit: 11, length: 1, isLittleEndian: true, isSigned: false, scale: 1, offset: 0, min: 0, max: 1, unit: "" },
            "B+ Overvoltage Cutback Fault": { name: "B+ Overvoltage Cutback Fault", startBit: 12, length: 1, isLittleEndian: true, isSigned: false, scale: 1, offset: 0, min: 0, max: 1, unit: "" },
            "5V Supply Fault": { name: "5V Supply Fault", startBit: 13, length: 1, isLittleEndian: true, isSigned: false, scale: 1, offset: 0, min: 0, max: 1, unit: "" },
            "Motor Temp Hot Cutback Fault": { name: "MotorTemp Hot Cutback Fault", startBit: 14, length: 1, isLittleEndian: true, isSigned: false, scale: 1, offset: 0, min: 0, max: 1, unit: "" },
            "Motor Temp Sensor Fault": { name: "Motor Temp Sensor Fault", startBit: 15, length: 1, isLittleEndian: true, isSigned: false, scale: 1, offset: 0, min: 0, max: 1, unit: "" },
            "Main Contactor Open/Short Fault": { name: "Main Contactor Open/Shot Fault", startBit: 16, length: 1, isLittleEndian: true, isSigned: false, scale: 1, offset: 0, min: 0, max: 1, unit: "" },
            "Sin/Cos Sensor Fault": { name: "Sin/Cos Sensor Fault", startBit: 17, length: 1, isLittleEndian: true, isSigned: false, scale: 1, offset: 0, min: 0, max: 1, unit: "" },
            "Motor Phase Open Fault": { name: "Motor Phase Open Fault", startBit: 18, length: 1, isLittleEndian: true, isSigned: false, scale: 1, offset: 0, min: 0, max: 1, unit: "" },
            "Main Contactor Weld Fault": { name: "Main Contactor Weld Fault", startBit: 19, length: 1, isLittleEndian: true, isSigned: false, scale: 1, offset: 0, min: 0, max: 1, unit: "" },
            "Main Contactor Not Closing Fault": { name: "Main Contactor Not Closing Fault", startBit: 20, length: 1, isLittleEndian: true, isSigned: false, scale: 1, offset: 0, min: 0, max: 1, unit: "" },
            "Throttle Wiper High Fault": { name: "Throttle Wiper High Fault", startBit: 21, length: 1, isLittleEndian: true, isSigned: false, scale: 1, offset: 0, min: 0, max: 1, unit: "" },
            "Throttle Wiper low Fault": { name: "Throttle Wiper Low Fault", startBit: 22, length: 1, isLittleEndian: true, isSigned: false, scale: 1, offset: 0, min: 0, max: 1, unit: "" },
            "EEPROM Fault": { name: "EEPROM Fault", startBit: 23, length: 1, isLittleEndian: true, isSigned: false, scale: 1, offset: 0, min: 0, max: 1, unit: "" },
            "VCL Run Time Fault": { name: "VCL Run Time Fault", startBit: 24, length: 1, isLittleEndian: true, isSigned: false, scale: 1, offset: 0, min: 0, max: 1, unit: "" },
            "Motor Characterization Fault": { name: "Motor Characterization Fault", startBit: 25, length: 1, isLittleEndian: true, isSigned: false, scale: 1, offset: 0, min: 0, max: 1, unit: "" },
            "Encoder Pulse Count Fault": { name: "Encoder Pulse Count Fault", startBit: 26, length: 1, isLittleEndian: true, isSigned: false, scale: 1, offset: 0, min: 0, max: 1, unit: "" },
            "Encoder LOS Fault": { name: "Encoder LOS Fault", startBit: 27, length: 1, isLittleEndian: true, isSigned: false, scale: 1, offset: 0, min: 0, max: 1, unit: "" },
            "Brake Wiper High Fault": { name: "Brake Wiper High Fault", startBit: 28, length: 1, isLittleEndian: true, isSigned: false, scale: 1, offset: 0, min: 0, max: 1, unit: "" },
            "Brake Wiper Low Fault": { name: "Brake Wiper Law Fault", startBit: 29, length: 1, isLittleEndian: true, isSigned: false, scale: 1, offset: 0, min: 0, max: 1, unit: "" },
            "High Pedal Disable Fault": { name: "High Pedal Disable Fault", startBit: 30, length: 1, isLittleEndian: true, isSigned: false, scale: 1, offset: 0, min: 0, max: 1, unit: "" },
        }
    },
    "271061072": { // 0X10281050
        name: "Battery_IPC_Info",
        dlc: 8,
        signals: {
            "StateOfCharge": { name: "StateOfCharge", startBit: 0, length: 8, isLittleEndian: true, isSigned: false, scale: 1, offset: 0, min: 0, max: 100, unit: "%" },
            "DistanceToEmpty": { name: "DistanceToEmpty", startBit: 8, length: 8, isLittleEndian: true, isSigned: false, scale: 1, offset: 0, min: 0, max: 255, unit: "Km" },
            "TimeToCharge": { name: "TimeToCharge", startBit: 16, length: 8, isLittleEndian: true, isSigned: false, scale: 3, offset: 0, min: 0, max: 765, unit: "Min" },
            "BatteryTemp": { name: "BatteryTemp", startBit: 24, length: 8, isLittleEndian: true, isSigned: true, scale: 1, offset: 0, min: -128, max: 127, unit: "degC" },
            "KeyOnIndicator": { name: "KeyOnIndicator", startBit: 34, length: 2, isLittleEndian: true, isSigned: false, scale: 1, offset: 0, min: 0, max: 3, unit: "" },
            "BatteryFaultIndicator": { name: "BatteryFaultIndicator", startBit: 36, length: 2, isLittleEndian: true, isSigned: false, scale: 1, offset: 0, min: 0, max: 3, unit: "" },
            "BatterySwap": { name: "BatterySwap", startBit: 38, length: 1, isLittleEndian: true, isSigned: false, scale: 1, offset: 0, min: 0, max: 1, unit: "" },
        }
    },
    "419365728": { // 0X18FF0360
        name: "Battery_Status_TPDO3",
        dlc: 8,
        signals: {
            "BatteryState": { name: "BatteryState", startBit: 56, length: 8, isLittleEndian: true, isSigned: false, scale: 1, offset: 0, min: 0, max: 5, unit: "" },
        }
    },
    "337854544": { // 0X14234050
        name: "Battery_MCU_Current",
        dlc: 8,
        signals: {
            "BatteryCurrent": { name: "BatteryCurrent", startBit: 0, length: 16, isLittleEndian: true, isSigned: true, scale: 0.1, offset: 0, min: -250, max: 250, unit: "A" },
            "DriveCurrentLimit": { name: "DriveCurrentLimit", startBit: 16, length: 8, isLittleEndian: true, isSigned: false, scale: 1, offset: 0, min: 0, max: 255, unit: "" },
            "RegenCurrentLimit": { name: "RegenCurrentLimit", startBit: 24, length: 8, isLittleEndian: true, isSigned: false, scale: 1, offset: 0, min: 0, max: 255, unit: "" },
        }
    },
    "338624400": { // 0X142EFF90
        name: "Battery_IPC_Capacity",
        dlc: 8,
        signals: {
            "BatteryCurrent1": { name: "BatteryCurrent1", startBit: 0, length: 16, isLittleEndian: true, isSigned: true, scale: 0.1, offset: 0, min: -250, max: 250, unit: "A" },
            "AmpereHours": { name: "AmpereHours", startBit: 16, length: 16, isLittleEndian: true, isSigned: true, scale: 0.01, offset: 0, min: 0, max: 0, unit: "Ahr" },
            "KilowattHours": { name: "KilowattHours", startBit: 32, length: 16, isLittleEndian: true, isSigned: true, scale: 0.01, offset: 0, min: 0, max: 0, unit: "kWhr" },
            "BatteryPackVoltage": { name: "BatteryPackVoltage", startBit: 48, length: 16, isLittleEndian: true, isSigned: false, scale: 0.01, offset: 0, min: 0, max: 0, unit: "Volt" },
        }
    },
    "337920080": { // 0X14244050
        name: "Battery_MCU_CellVoltage",
        dlc: 8,
        signals: {
            "MinCellVoltage": { name: "MinCellVoltage", startBit: 0, length: 16, isLittleEndian: true, isSigned: false, scale: 0.001, offset: 0, min: 0, max: 0, unit: "Volt" },
            "MaxCellVoltage": { name: "MaxCellVoltage", startBit: 32, length: 16, isLittleEndian: true, isSigned: false, scale: 0.001, offset: 0, min: 0, max: 0, unit: "Volt" },
        }
    },
    "405164096": { // 0X18265040
        name: "MCU_IPC_ControllerInfo",
        dlc: 8,
        signals: {
            "ControllerTemp": { name: "ControllerTemp", startBit: 0, length: 8, isLittleEndian: true, isSigned: true, scale: 1, offset: 0, min: -40, max: 215, unit: "DegC" },
            "MotorTemp": { name: "MotorTemp", startBit: 8, length: 8, isLittleEndian: true, isSigned: false, scale: 1, offset: -50, min: -50, max: 205, unit: "DegC" },
        }
    },
    "405229632": { // 0X18275040
        name: "MCU_IPC_VehicleInfo",
        dlc: 8,
        signals: {
            "CapacitorVoltage": { name: "CapacitorVoltage", startBit: 16, length: 16, isLittleEndian: true, isSigned: false, scale: 0.1, offset: 0, min: 0, max: 0, unit: "Volt" },
            "Speed": { name: "Speed", startBit: 48, length: 8, isLittleEndian: true, isSigned: false, scale: 1, offset: 0, min: 0, max: 100, unit: "Kmph" },
        }
    },
    "405208961": { // 0X1826FF81
        name: "MCU_IPC_ModeInfo",
        dlc: 8,
        signals: {
             "VehicleMode": { name: "VehicleMode", startBit: 32, length: 3, isLittleEndian: true, isSigned: false, scale: 1, offset: 0, min: 0, max: 7, unit: "" },
             "DriveMode": { name: "DriveMode", startBit: 56, length: 3, isLittleEndian: true, isSigned: false, scale: 1, offset: 0, min: 0, max: 7, unit: "" },
             "RegenFlag": { name: "RegenFlag", startBit: 59, length: 1, isLittleEndian: true, isSigned: false, scale: 1, offset: 0, min: 0, max: 1, unit: "" },
             "Speed": { name: "Speed", startBit: 48, length: 8, isLittleEndian: true, isSigned: false, scale: 1, offset: 0, min: 0, max: 255, unit: "" },
        }
    },
    "1536": { // 0x600 - Example for user-provided log format
        name: "MCU_IPC_VehicleInfo_Example",
        dlc: 8,
        signals: {
            "CapacitorVoltage": { name: "CapacitorVoltage", startBit: 16, length: 16, isLittleEndian: true, isSigned: false, scale: 0.1, offset: 0, min: 0, max: 0, unit: "Volt" },
            "Speed": { name: "Speed", startBit: 48, length: 8, isLittleEndian: true, isSigned: false, scale: 1, offset: 0, min: 0, max: 100, unit: "Kmph" },
        }
    }
};