import React, { useState } from "react";
import { Cpu, Terminal, RefreshCw, Zap, Sliders, Play, ShieldAlert, HardDrive, Check } from "lucide-react";

interface SerialDevPanelProps {
  onRunCommand: (command: string) => void;
}

const PRESET_SERIAL_PORTS = [
  { device: "/dev/ttyUSB0", name: "USB-to-UART Serial Converter", status: "online", driver: "ch341 / ftdi_sio" },
  { device: "/dev/ttyUSB1", name: "CP2102 Serial Port", status: "online", driver: "cp210x" },
  { device: "/dev/ttyS0", name: "Standard High-Speed COM1", status: "offline", driver: "serial8250" },
  { device: "/dev/ttyAMA0", name: "Raspberry Pi PL011 UART", status: "online", driver: "uart-pl011" }
];

const PRESET_DEV_TREES = [
  { path: "/dev/i2c-1", type: "I2C Bus Controller", desc: "主板 I2C 1 号总线设备" },
  { path: "/dev/spidev0.0", type: "SPI Bus Controller", desc: "SPI 总线 0 设备 0" },
  { path: "/dev/nvme0n1", type: "NVMe Block Storage", desc: "高速 NVMe 固态硬盘块设备" },
  { path: "/dev/input/event0", type: "Input Event Device", desc: "Linux 输入设备事件句柄" }
];

export const SerialDevPanel: React.FC<SerialDevPanelProps> = ({ onRunCommand }) => {
  const [selectedPort, setSelectedPort] = useState("/dev/ttyUSB0");
  const [baudRate, setBaudRate] = useState("115200");
  const [dataBits, setDataBits] = useState("8");
  const [stopBits, setStopBits] = useState("1");
  const [parity, setParity] = useState("none");
  const [connected, setConnected] = useState(false);

  const handleConnectSerial = () => {
    const cmd = `picocom -b ${baudRate} -d ${dataBits} -p ${parity === "none" ? "n" : parity} ${selectedPort} || minicom -D ${selectedPort} -b ${baudRate}`;
    onRunCommand(cmd);
    setConnected(true);
  };

  return (
    <div className="flex h-full flex-col bg-zinc-950 text-zinc-100 p-4 space-y-4 overflow-y-auto select-none">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-zinc-800 pb-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/30">
          <Zap className="h-4 w-4" />
        </div>
        <div>
          <h3 className="text-sm font-extrabold text-zinc-100 flex items-center gap-2">
            <span>串口与硬件设备树</span>
            <span className="rounded-full bg-amber-500/10 border border-amber-500/30 px-2 py-0.2 text-[10px] text-amber-400 font-mono">
              Serial TTY & /dev
            </span>
          </h3>
          <p className="text-[11px] text-zinc-400">串口调试 (USB-UART / minicom) 与 Linux 设备树节点扫描</p>
        </div>
      </div>

      {/* Serial Connection Settings */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-3 shadow-md">
        <div className="flex items-center justify-between">
          <span className="text-xs font-extrabold text-zinc-200 flex items-center gap-1.5">
            <Sliders className="h-3.5 w-3.5 text-amber-400" /> 串口连接参数配置
          </span>
          <button
            onClick={() => onRunCommand("ls -l /dev/tty* /dev/serial/by-id/* 2>/dev/null")}
            className="flex items-center gap-1 text-[11px] font-bold text-amber-400 hover:text-amber-300 transition-colors"
          >
            <RefreshCw className="h-3 w-3" /> 刷新端口
          </button>
        </div>

        <div className="space-y-2">
          <div>
            <label className="text-[11px] font-bold text-zinc-400">串口设备节点 (/dev):</label>
            <select
              value={selectedPort}
              onChange={(e) => setSelectedPort(e.target.value)}
              className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-1.5 font-mono text-xs text-amber-300 focus:border-amber-500 focus:outline-none"
            >
              {PRESET_SERIAL_PORTS.map((p) => (
                <option key={p.device} value={p.device}>
                  {p.device} ({p.name})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] font-bold text-zinc-400">波特率 (Baud Rate):</label>
              <select
                value={baudRate}
                onChange={(e) => setBaudRate(e.target.value)}
                className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 font-mono text-xs text-zinc-200 focus:border-amber-500 focus:outline-none"
              >
                {["9600", "19200", "38400", "57600", "115200", "230400", "921600"].map((b) => (
                  <option key={b} value={b}>
                    {b} bps
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] font-bold text-zinc-400">数据位/停止位:</label>
              <div className="mt-1 flex gap-1">
                <select
                  value={dataBits}
                  onChange={(e) => setDataBits(e.target.value)}
                  className="w-1/2 rounded-xl border border-zinc-800 bg-zinc-950 px-2 py-1.5 font-mono text-xs text-zinc-200"
                >
                  <option value="8">8 bits</option>
                  <option value="7">7 bits</option>
                </select>
                <select
                  value={stopBits}
                  onChange={(e) => setStopBits(e.target.value)}
                  className="w-1/2 rounded-xl border border-zinc-800 bg-zinc-950 px-2 py-1.5 font-mono text-xs text-zinc-200"
                >
                  <option value="1">1 stop</option>
                  <option value="2">2 stop</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <button
          onClick={handleConnectSerial}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-amber-600 hover:bg-amber-500 py-2 text-xs font-extrabold text-white shadow-md shadow-amber-600/20 transition-all cursor-pointer active:scale-95"
        >
          <Play className="h-3.5 w-3.5" />
          <span>打开串口交互终端 (picocom/minicom)</span>
        </button>
      </div>

      {/* Hardware /dev Tree Explorer */}
      <div className="space-y-2">
        <span className="text-xs font-extrabold text-zinc-300 flex items-center gap-1.5">
          <HardDrive className="h-3.5 w-3.5 text-amber-400" /> Linux 设备树节点排查 (/dev)
        </span>
        <div className="space-y-2">
          {PRESET_DEV_TREES.map((dev) => (
            <div
              key={dev.path}
              className="flex items-center justify-between rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-3 hover:border-amber-500/40 transition-all"
            >
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-amber-300">{dev.path}</span>
                  <span className="rounded-full bg-zinc-800 px-2 py-0.1 text-[10px] text-zinc-400">
                    {dev.type}
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400">{dev.desc}</p>
              </div>

              <button
                onClick={() => onRunCommand(`udevadm info -q all -n ${dev.path} || ls -l ${dev.path}`)}
                className="rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-[11px] font-bold text-zinc-300 hover:bg-zinc-800 hover:text-amber-300 transition-colors"
              >
                查看 udev 属性
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
