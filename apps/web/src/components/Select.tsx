import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, JSX } from "react";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps {
  id?: string;
  value: string;
  options: SelectOption[];
  onChange(_value: string): void;
  disabled?: boolean;
  placeholder?: string;
  fullWidth?: boolean;
  size?: "default" | "compact";
  className?: string;
  name?: string;
  ariaLabel?: string;
  ariaLabelledBy?: string;
}

const getNextEnabledIndex = (
  options: SelectOption[],
  start: number,
  delta: 1 | -1
): number => {
  if (options.length === 0) return -1;
  let index = start;
  for (let attempts = 0; attempts < options.length; attempts += 1) {
    index = (index + delta + options.length) % options.length;
    if (!options[index]?.disabled) return index;
  }
  return -1;
};

const Select = ({
  id,
  value,
  options,
  onChange,
  disabled = false,
  placeholder = "Select…",
  fullWidth = false,
  size = "default",
  className = "",
  name,
  ariaLabel,
  ariaLabelledBy,
}: SelectProps): JSX.Element => {
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(() =>
    options.findIndex((option) => option.value === value)
  );

  const instanceId = useId();
  const controlId = id ?? `${instanceId}-control`;
  const menuId = `${controlId}-menu`;

  const selectedOption = useMemo(
    () => options.find((option) => option.value === value && !option.disabled),
    [options, value]
  );

  useEffect(() => {
    const handler = (event: MouseEvent | TouchEvent): void => {
      if (!containerRef.current || containerRef.current.contains(event.target as Node)) return;
      setOpen(false);
    };
    if (open) {
      document.addEventListener("mousedown", handler);
      document.addEventListener("touchstart", handler);
    }
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const index = options.findIndex(
      (option) => option.value === value && !option.disabled
    );
    const firstEnabled = getNextEnabledIndex(options, -1, 1);
    setActiveIndex(index >= 0 ? index : firstEnabled);
    queueMicrotask(() => {
      menuRef.current?.focus({ preventScroll: true });
    });
  }, [open, options, value]);

  useEffect(() => {
    if (!open) return;
    const menu = menuRef.current;
    if (!menu || activeIndex < 0) return;
    const option = menu.querySelector<HTMLLIElement>(`[data-index="${activeIndex}"]`);
    if (!option) return;
    const optionTop = option.offsetTop;
    const optionBottom = optionTop + option.offsetHeight;
    if (optionTop < menu.scrollTop) {
      menu.scrollTop = optionTop;
    } else if (optionBottom > menu.scrollTop + menu.clientHeight) {
      menu.scrollTop = optionBottom - menu.clientHeight;
    }
  }, [activeIndex, open]);

  const commitValue = (nextValue: string): void => {
    if (disabled || value === nextValue) {
      setOpen(false);
      return;
    }
    onChange(nextValue);
    setOpen(false);
  };

  const handleButtonKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (disabled) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const delta = event.key === "ArrowDown" ? 1 : -1;
      if (!open) {
        setOpen(true);
        return;
      }
      const next = getNextEnabledIndex(options, activeIndex, delta);
      if (next >= 0) setActiveIndex(next);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
      } else if (activeIndex >= 0 && !options[activeIndex]?.disabled) {
        commitValue(options[activeIndex].value);
      }
    } else if (event.key === "Escape") {
      if (open) {
        event.preventDefault();
        setOpen(false);
      }
    }
  };

  const handleMenuKeyDown = (event: KeyboardEvent<HTMLUListElement>): void => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const delta = event.key === "ArrowDown" ? 1 : -1;
      const next = getNextEnabledIndex(options, activeIndex, delta);
      if (next >= 0) setActiveIndex(next);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (activeIndex >= 0 && !options[activeIndex]?.disabled) {
        commitValue(options[activeIndex].value);
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  };

  const containerClasses = [
    "select",
    fullWidth ? "select--full" : "",
    size === "compact" ? "select--compact" : "",
    disabled ? "select--disabled" : "",
    open ? "select--open" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const displayValue = selectedOption?.label ?? placeholder;
  const valueClass = selectedOption
    ? "select__value"
    : "select__value select__value--placeholder";

  return (
    <div ref={containerRef} className={containerClasses}>
      {typeof name === "string" && name.trim().length > 0 ? (
        <input type="hidden" name={name} value={value} disabled={disabled} />
      ) : null}

      <button
        type="button"
        className="select__button"
        id={controlId}
        onClick={() => {
          if (!disabled) setOpen((current) => !current);
        }}
        onKeyDown={handleButtonKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        disabled={disabled}
      >
        <span className={valueClass}>{displayValue}</span>
        <span className="select__chevron" aria-hidden="true" />
      </button>

      {open ? (
        <ul
          ref={menuRef}
          className="select__menu"
          role="listbox"
          id={menuId}
          tabIndex={-1}
          aria-activedescendant={
            activeIndex >= 0 ? `${menuId}-option-${activeIndex}` : undefined
          }
          onKeyDown={handleMenuKeyDown}
        >
          {options.map((option, index) => {
            const isSelected = option.value === selectedOption?.value;
            const isActive = index === activeIndex;
            const optionClasses = [
              "select__option",
              isSelected ? "select__option--selected" : "",
              isActive ? "select__option--active" : "",
              option.disabled ? "select__option--disabled" : "",
            ]
              .filter(Boolean)
              .join(" ");

            return (
              <li
                key={option.value}
                id={`${menuId}-option-${index}`}
                data-index={index}
                role="option"
                aria-selected={isSelected}
                aria-disabled={option.disabled}
                className={optionClasses}
                onMouseEnter={() => {
                  if (!option.disabled) setActiveIndex(index);
                }}
                onMouseDown={(event) => {
                  event.preventDefault();
                  if (!option.disabled) commitValue(option.value);
                }}
              >
                {option.label}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
};

export default Select;
