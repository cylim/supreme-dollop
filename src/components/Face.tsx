import * as stylex from '@stylexjs/stylex'

export function Face({
  picture,
  initial,
}: {
  picture: string | null
  initial: string
}) {
  if (picture) {
    return (
      <img
        src={picture}
        alt=""
        title={initial}
        width={28}
        height={28}
        {...stylex.props(styles.picture)}
      />
    )
  }
  return (
    <span title={initial} {...stylex.props(styles.initial)}>
      {initial}
    </span>
  )
}

const styles = stylex.create({
  picture: {
    width: 28,
    height: 28,
    borderRadius: 999,
    objectFit: 'cover',
    backgroundColor: '#dcecdf',
  },
  initial: {
    width: 28,
    height: 28,
    display: 'grid',
    placeItems: 'center',
    borderRadius: 999,
    color: '#174d2e',
    backgroundColor: '#dcecdf',
    fontSize: 12,
    fontWeight: 800,
  },
})
