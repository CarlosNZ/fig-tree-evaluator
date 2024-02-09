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
  ...props
}: Props<Option, IsMulti, Group>) => {
  console.log('Current operator value', value)

  return (
    <ReactSelect
      value={value}
      classNamePrefix="ft-rs"
      styles={{
        control: (base, _) => ({
          ...base,
          minHeight: '2em',
          height: '2em',
          maxWidth: '10em',
        }),

        // valueContainer: (provided, state) => ({
        //   ...provided,
        //   height: '30px',
        //   padding: '0 6px',
        // }),

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
      }}
      {...props}
    />
  )
}

export { Select, SelectOption }
