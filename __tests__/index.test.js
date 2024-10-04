const { action } = require('../src/main')

jest.mock('../src/main', () => ({
  action: {
    run: jest.fn()
  }
}))

describe('index', () => {
  test('calls run method of ApprovalAction', () => {
    require('../src/index')
    expect(action.run).toHaveBeenCalled()
  })
})
