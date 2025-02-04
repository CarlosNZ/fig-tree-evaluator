import React from 'react'
import { OperatorAlias, Operator as OpType } from 'fig-tree-evaluator'
import { IconEdit } from './_imports'
import { Icons } from './Icons'
import { getButtonFontSize } from './helpers'
import { OperatorDisplay, operatorDisplay } from './operatorDisplay'

const README_URL = 'https://github.com/CarlosNZ/fig-tree-evaluator?tab=readme-ov-file#'

interface DisplayBarProps {
  name: OperatorAlias
  description?: string
  setIsEditing: () => void
  evaluate: (e: React.MouseEvent) => void
  isLoading: boolean
  canonicalName: OpType | 'FRAGMENT'
  operatorDisplay?: OperatorDisplay
}

export const DisplayBar: React.FC<DisplayBarProps> = ({
  name,
  description,
  setIsEditing,
  evaluate,
  isLoading,
  canonicalName = 'CUSTOM_FUNCTIONS',
  operatorDisplay: operatorDisplayOverride,
}) => {
  const { backgroundColor, textColor, displayName } =
    operatorDisplayOverride ?? operatorDisplay[canonicalName]
  const isShorthand = name.startsWith('$')
  const linkSuffix =
    canonicalName === 'FRAGMENT'
      ? 'fragments'
      : canonicalName === 'CUSTOM_FUNCTIONS'
        ? 'custom-functionsoperators'
        : canonicalName.toLowerCase()
  const link = README_URL + linkSuffix

  return (
    <div className="ft-display-bar">
      <div className="ft-button-and-edit" title={description}>
        <EvaluateButton
          name={name}
          backgroundColor={backgroundColor}
          textColor={textColor}
          evaluate={evaluate}
          isLoading={isLoading}
          isShorthand={isShorthand}
        />
        {!isShorthand && (
          <span onClick={() => setIsEditing()} className="ft-clickable ft-edit-icon">
            <IconEdit size="1.5em" style={{ color: 'rgb(42, 161, 152)' }} />
          </span>
        )}
      </div>
      <div className="ft-display-name">
        <a href={link} target="_blank">
          {displayName}
        </a>
      </div>
    </div>
  )
}

export interface EvaluateButtonProps {
  name?: string
  backgroundColor: string
  textColor: string
  evaluate: (e: React.MouseEvent) => void
  isLoading: boolean
  isShorthand?: boolean
}

export const EvaluateButton: React.FC<EvaluateButtonProps> = ({
  name,
  backgroundColor,
  textColor,
  evaluate,
  isLoading,
  isShorthand = false,
}) => {
  return (
    <div
      className="ft-display-button"
      style={{ backgroundColor, color: textColor }}
      onClick={(e) => evaluate(e)}
    >
      {!isLoading ? (
        <>
          {name && (
            <span
              className="ft-operator-alias"
              style={{
                fontSize: getButtonFontSize(name),
                fontStyle: isShorthand ? 'italic' : 'inherit',
              }}
            >
              {name}
            </span>
          )}
          {Icons.evaluate}
        </>
      ) : (
        <div style={{ width: '100%', textAlign: 'center' }}>
          <span
            className="ft-loader"
            style={{ width: '1.5em', height: '1.5em', borderTopColor: textColor }}
          ></span>
        </div>
      )}
    </div>
  )
}
