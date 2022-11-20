"""
Rewrite rules testing application

Author: Blake Dworaczyk <blaked@tamu.edu>
"""

import argparse
import glob
import json
import os
import subprocess
import sys


class RewriteTester:
    def __init__(self, test_dir: str, debug: bool):
        self._test_dir = test_dir
        self._debug = debug

    # Run all tests in the testing directory
    def run_all_tests(self, do_sam_build: bool):
      # Build the sam function
      if do_sam_build:
        self.sam_build()

      # Find pairs of event and result files
      json_files = glob.glob(f'{self._test_dir}/*.json') 
      json_files = glob.glob(os.path.join(self._test_dir, '*.json')) 
      tests_to_run = []
      tests_found = []
      for json_file in json_files:
        test_path = os.sep.join(json_file.split(os.sep)[0:-1])
        filename = json_file.split(os.sep)[-1]
        event = False
        if filename.startswith('result-'):
          test_name = filename.split('result-')[1]
          other_test = os.path.join(test_path, f'event-{test_name}')
        elif filename.startswith('event-'):
          test_name = filename.split('event-')[1]
          other_test = os.path.join(test_path, f'result-{test_name}')
          event = True
        else:
          continue
        tests_found.append(json_file)
        if json_file in tests_found and other_test in tests_found:
          if event:
            tests_to_run.append({'event': os.path.abspath(json_file), 'result': os.path.abspath(other_test)})
          else:
            tests_to_run.append({'result': os.path.abspath(json_file), 'event': os.path.abspath(other_test)})

      if self._debug:
        print('Found the following tests to run:')  
        print(tests_to_run)
        print()

      success = True
      for test in tests_to_run:
        success = self.run_test(test_event=test['event'], test_result=test['result']) and success

      if not success:
        sys.exit(1)

    # Run a test and compare the output to the expected output
    def run_test(self, test_event: str, test_result: str) -> bool:
      test_event_name = test_event.split(os.sep)[-1]
      test_result_name = test_result.split(os.sep)[-1]
      if self._debug:
        print(f'Running test with test event: "{test_event}" and test result: "{test_result}"')

      print(f'Running test with test event name: "{test_event_name}" and test result name: "{test_result_name}"')

      process = subprocess.Popen(f'./test_event.sh {test_event} ../rules/rules.json'.split(' '), 
          stdout=subprocess.PIPE, stderr=subprocess.PIPE, cwd='sam')
      stdout, stderr = process.communicate()
      if self._debug:
        print(stdout.decode('utf-8'))
      if process.returncode != 0:
        print(stderr.decode('utf-8'))
        print('sam invoke completely failed!')
        return False

      result_dict = json.loads(stdout)
      with open(test_result, 'r') as fp:
        event_dict = json.load(fp)
      
      res = self.result_dict_matches_desired(event_dict=event_dict, result_dict=result_dict)
      if res:
        print(f'Test "{test_event_name}" PASSED')
      else:
        print(f'Test "{test_event_name}" FAILED')

      return res

    def result_dict_matches_desired(self, event_dict: dict, result_dict: dict):
      return \
        event_dict['status'] == result_dict['status'] and \
        event_dict['headers']['location'][0]['value'] == result_dict['headers']['location'][0]['value']

    def sam_build(self):
      process = subprocess.Popen(f'sam build'.split(' '), 
          stdout=subprocess.PIPE, stderr=subprocess.PIPE, cwd='sam')
      stdout, stderr = process.communicate()
      print(stdout.decode('utf-8'))
      print(stderr.decode('utf-8'))
      if process.returncode != 0:
        print('sam build failed... aborting')
        sys.exit(2)



def main():
    parser = argparse.ArgumentParser(
        add_help='Runs tests to ensure that the redirect rules provide the expected output')
    parser.add_argument('--test_path', help='The directory that contains the tests', required=True)
    parser.add_argument('--build_sam', help='Build the SAM function before tests', action='store_true')
    parser.add_argument('--debug', help='Enable debugging output', action='store_true')
    args = parser.parse_args()

    rewrite_tester = RewriteTester(test_dir=args.test_path, debug=args.debug)
    rewrite_tester.run_all_tests(do_sam_build=args.build_sam)


if __name__ == "__main__":
    main()
