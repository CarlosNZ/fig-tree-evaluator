import React from 'react'
import ReactSelect, { OptionProps } from 'react-select'

// Custom re-export of react-select

interface SelectProps {
  value: any
  options: OptionProps
  ReactSelectProps: any
}

export const Select: React.FC<SelectProps> = ({ value, options, ReactSelectProps }) => {
  return (
    <ReactSelect
      options={options}
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
      {...ReactSelectProps}
    />
  )
}
