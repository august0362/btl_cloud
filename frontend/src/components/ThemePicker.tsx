import { useId, useRef, useState, type ReactNode } from "react";
import { useTheme } from "../theme/context";
import { palettes, type ThemeMode } from "../theme/palettes";
import styles from "./ThemePicker.module.css";

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const modes: { id: ThemeMode; name: string; icon: ReactNode }[] = [
  {
    id: "light",
    name: "Sáng",
    icon: (
      <Icon>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </Icon>
    ),
  },
  {
    id: "dark",
    name: "Tối",
    icon: (
      <Icon>
        <path d="M20.2 14.5A8.5 8.5 0 0 1 9.5 3.8 8.5 8.5 0 1 0 20.2 14.5Z" />
      </Icon>
    ),
  },
  {
    id: "system",
    name: "Theo hệ thống",
    icon: (
      <Icon>
        <rect x="3" y="4" width="18" height="13" rx="2" />
        <path d="M12 17v4M8 21h8" />
      </Icon>
    ),
  },
];

export function ThemePicker() {
  const { palette, mode, setPalette, setMode } = useTheme();
  const selected = palettes.find((item) => item.id === palette)!;
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const id = useId();

  const close = () => dialog.current?.close();

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={styles.trigger}
        aria-label="Tuỳ chỉnh giao diện"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => {
          dialog.current?.showModal();
          setOpen(true);
        }}
      >
        <Icon>
          <path d="M12 3a9 9 0 1 0 0 18h1.5a2 2 0 0 0 1.3-3.5 1.6 1.6 0 0 1 1.1-2.8h1.7A3.4 3.4 0 0 0 21 11.3 9 9 0 0 0 12 3Z" />
          <circle cx="7.5" cy="10" r=".7" />
          <circle cx="11" cy="7" r=".7" />
          <circle cx="15" cy="8" r=".7" />
          <circle cx="7.5" cy="14.5" r=".7" />
        </Icon>
        <span className={styles.triggerLabel}>Giao diện</span>
        <span className={styles.triggerName}>{selected.name}</span>
      </button>
      <dialog
        ref={dialog}
        id={id}
        className={styles.dialog}
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-description`}
        onClose={() => {
          setOpen(false);
          trigger.current?.focus();
        }}
        onClick={(event) => {
          // Backdrop clicks have the dialog as target but fall outside its bounds.
          if (event.target !== event.currentTarget) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < bounds.left ||
            event.clientX > bounds.right ||
            event.clientY < bounds.top ||
            event.clientY > bounds.bottom
          ) {
            close();
          }
        }}
      >
        <div className={styles.heading}>
          <div>
            <h2 id={`${id}-title`}>Giao diện của bạn</h2>
            <p id={`${id}-description`}>Chọn bảng màu và chế độ bạn yêu thích.</p>
          </div>
          <button
            type="button"
            className={styles.close}
            aria-label="Đóng tuỳ chỉnh"
            onClick={close}
          >
            ×
          </button>
        </div>
        <div className={styles.body}>
          <p className={styles.label}>Chế độ hiển thị</p>
          <div className={styles.modes} role="group" aria-label="Chế độ hiển thị">
            {modes.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={mode === item.id}
                onClick={() => setMode(item.id)}
              >
                {item.icon}
                {item.name}
              </button>
            ))}
          </div>
          <div className={styles.paletteHeading}>
            <p className={styles.label}>Bảng màu · {palettes.length} theme</p>
            <span>{selected.name}</span>
          </div>
          <div className={styles.grid} role="group" aria-label="Chọn bảng màu">
            {palettes.map((item) => (
              <button
                key={item.id}
                type="button"
                className={styles.card}
                data-theme-option={item.id}
                aria-label={item.name}
                aria-pressed={palette === item.id}
                onClick={() => setPalette(item.id)}
              >
                <span className={styles.swatches} aria-hidden="true">
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
                <span>{item.name}</span>
              </button>
            ))}
          </div>
        </div>
        <div className={styles.footer}>
          <p>Lựa chọn được lưu trên trình duyệt này.</p>
          <button type="button" className="button button--primary" onClick={close}>
            Xong
          </button>
        </div>
      </dialog>
    </>
  );
}
