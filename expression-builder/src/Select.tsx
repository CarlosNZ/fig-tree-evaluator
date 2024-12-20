import React from 'react'
import ReactSelect, { GroupBase, Props } from 'react-select'

// Custom re-export of react-select

interface SelectOption {
  value: string
  label: string
}

const Select: React.FC<Props> = <
  Option,
  IsMulti extends boolean = false,
  Group extends GroupBase<Option> = GroupBase<Option>,
>({
  value,
  styles = {},
  ...props
}: Props<Option, IsMulti, Group>) => {
  const { control = {} } = styles as Record<string, React.CSSProperties>
  return (
    <ReactSelect
      value={value}
      classNamePrefix="ft-rs"
      // This fixes the bug where the selected item is not scrolled into view
      // when first opening the menu:
      onMenuOpen={() => {
        setTimeout(() => {
          const selectedEl = document.getElementsByClassName('ft-rs__option--is-selected')[0]
          if (selectedEl) {
            selectedEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' })
          }
        }, 15)
      }}
      styles={{
        control: (base, _) => ({
          ...base,
          minHeight: '2em',
          height: '2em',
          minWidth: '8em',
          maxWidth: '15em',
          fontSize: '0.8em',
          ...control,
        }),
        menu: (base, _) => ({
          ...base,
          width: 'fit-content',
        }),
        groupHeading: (provided, _) => ({
          ...provided,
          fontSize: '1.2em',
        }),
        input: (provided, _) => ({
          ...provided,
          margin: '0px',
        }),
        indicatorSeparator: (_) => ({
          display: 'none',
        }),
        indicatorsContainer: (provided, _) => ({
          ...provided,
          height: '2em',
        }),
        option: (provided) => ({
          ...provided,
          fontSize: '0.9em',
        }),
      }}
      {...props}
    />
  )
}

export { Select, type SelectOption }
