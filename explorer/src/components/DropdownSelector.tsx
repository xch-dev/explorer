import { ChevronDown } from 'lucide-react';
import { PropsWithChildren, useEffect, useRef, useState } from 'react';
import { Button } from './ui/button';

export interface DropdownSelectorProps<T> extends PropsWithChildren {
  loadedItems: T[];
  renderItem: (item: T) => React.ReactNode;
  onSelect: (item: T) => void;
  isDisabled?: (item: T) => boolean;
  width?: string;
  className?: string;
}

export function DropdownSelector<T>({
  loadedItems,
  renderItem,
  onSelect,
  isDisabled,
  width = 'w-[300px]',
  className,
  children,
}: DropdownSelectorProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const optionsRef = useRef<(HTMLDivElement | null)[]>([]);

  // Reset selected index when items change
  useEffect(() => {
    setSelectedIndex(-1);
  }, [loadedItems]);

  // Handle click outside and escape key
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (!isOpen) return;

      switch (event.key) {
        case 'Escape':
          setIsOpen(false);
          break;
        case 'ArrowDown':
          event.preventDefault();
          setSelectedIndex((prev) =>
            prev < loadedItems.length - 1 ? prev + 1 : prev,
          );
          break;
        case 'ArrowUp':
          event.preventDefault();
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : prev));
          break;
        case 'Enter':
          event.preventDefault();
          if (selectedIndex >= 0 && selectedIndex < loadedItems.length) {
            // If an item is selected, use that
            const item = loadedItems[selectedIndex];
            if (!isDisabled?.(item)) {
              onSelect(item);
              setIsOpen(false);
              setSelectedIndex(-1);
            }
          } else {
            // If no item is selected, use the first non-disabled item
            const firstValidIndex = loadedItems.findIndex(
              (item) => !isDisabled?.(item),
            );
            if (firstValidIndex >= 0) {
              onSelect(loadedItems[firstValidIndex]);
              setIsOpen(false);
              setSelectedIndex(-1);
            }
          }
          break;
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, loadedItems, selectedIndex, onSelect, isDisabled]);

  // Scroll selected item into view
  useEffect(() => {
    if (selectedIndex >= 0 && optionsRef.current[selectedIndex]) {
      optionsRef.current[selectedIndex]?.scrollIntoView({
        block: 'nearest',
      });
    }
  }, [selectedIndex]);

  return (
    <div
      className='min-w-0 flex-grow relative'
      role='combobox'
      ref={containerRef}
    >
      <Button
        variant='outline'
        className={`w-full justify-start p-2 h-16 ${className ?? ''}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup='listbox'
      >
        <div className='flex items-center gap-2 w-full justify-between min-w-0'>
          {children}
          <ChevronDown className='h-4 w-4 opacity-50 mr-2 flex-shrink-0' />
        </div>
      </Button>

      {isOpen && (
        <div
          className={`absolute z-50 ${width} bg-background border rounded-b-md shadow-lg`}
          role='listbox'
          aria-label='Options'
        >
          <div
            className='max-h-[260px] overflow-y-auto'
            ref={listRef}
            tabIndex={0}
            role='listbox'
          >
            {loadedItems.length === 0 ? (
              <div className='p-4 text-center text-sm text-muted-foreground'>
                No items available
              </div>
            ) : (
              loadedItems.map((item, i) => {
                const disabled = isDisabled?.(item) ?? false;
                return (
                  <div
                    // eslint-disable-next-line react/no-array-index-key
                    key={i}
                    ref={(el) => {
                      optionsRef.current[i] = el;
                    }}
                    onClick={() => {
                      if (!disabled) {
                        onSelect(item);
                        setIsOpen(false);
                      }
                    }}
                    role='option'
                    aria-selected={i === selectedIndex}
                    aria-disabled={disabled}
                    className={`px-2 py-3 text-sm cursor-pointer ${
                      disabled
                        ? 'opacity-50 cursor-not-allowed'
                        : i === selectedIndex
                          ? 'bg-accent'
                          : 'hover:bg-accent'
                    } ${i === loadedItems.length - 1 ? 'rounded-b-md' : ''}`}
                  >
                    {renderItem(item)}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
