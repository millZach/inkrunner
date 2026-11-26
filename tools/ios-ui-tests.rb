# Add an XCTest UI target only to the simulator job's temporary checkout.
require 'xcodeproj'

project = Xcodeproj::Project.open('ios/App/App.xcodeproj')
app = project.targets.find { |target| target.name == 'App' }
raise 'App target missing' unless app
tests = project.new_target(:ui_test_bundle, 'AppUITests', :ios, '16.0')
group = project.main_group.new_group('AppUITests', 'AppUITests')
tests.source_build_phase.add_file_reference(group.new_file('AppUITests.swift'))
tests.add_dependency(app)
tests.build_configurations.each do |configuration|
  configuration.build_settings.merge!({
    'GENERATE_INFOPLIST_FILE' => 'YES',
    'PRODUCT_BUNDLE_IDENTIFIER' => 'com.millzach.inkrunner.uitests',
    'PRODUCT_NAME' => '$(TARGET_NAME)',
    'TEST_TARGET_NAME' => 'App',
    'SWIFT_VERSION' => '5.0',
    'TARGETED_DEVICE_FAMILY' => '1,2',
    'CODE_SIGNING_ALLOWED' => 'NO',
  })
end
project.save
scheme = Xcodeproj::XCScheme.new
scheme.configure_with_targets(app, tests, launch_target: true)
scheme.test_action.build_configuration = 'Release'
scheme.save_as(project.path, 'App', true)
