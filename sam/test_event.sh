#!/bin/bash

# test comment

# Tests a CloudFront event against a local JSON file with rewrite rules
if [ $# -ne 2 ]
then
  echo "Usage: $0 <event JSON file> <rewrite rule JSON file>"
  exit 1
fi

# Ensure that the jq utility has been installed and is in the path
let jq_exists=1
which jq 2>&1 > /dev/null
if [ $? -ne 0 ]
then
  echo "The 'jq' utility is not installed, your JSON local rules location will not be automatically corrected"
  let jq_exists=0
fi


event_file="${1}"
temp_event_file="/tmp/$(echo "${event_file}" | rev | cut -d/ -f1 | rev)"
rewrite_file="${2}"

if [ ! -f "${event_file}" ]
then
  echo "JSON event file does not exist!"
  exit 2
fi

if [ ! -f "${rewrite_file}" ]
then
  echo "JSON rewrite file does not exist!"
  exit 3
fi

# Ensure that the rewrite Lambda function has already been built
if [ ! -d "./.aws-sam" ]
then
  sam build
  if [ $? -ne 0 ]
  then
    echo "'sam build' failed, are you not executing this script from the CloudFront SAM project root directory?"
    exit 4
  fi
fi


rule_path="./.aws-sam/build/LambdaEdgeRewriteFunction/rules.json"
# The rewrite rule needs to exist in path that will be mounted as the Docker container volume, so copy it
cp -f "${rewrite_file}" "${rule_path}"

# The event file needs to reference the correct local path or it will not be executed, ensure that it does
# if the jq utility is installed
if [ $jq_exists -eq 1 ]
then
  cat "${event_file}" | jq '.Records[0].cf.request.origin.custom.customHeaders."rules-url"[0].value = "../rules.json"' > "${temp_event_file}"
else
  cp -f "${event_file}"  "${temp_event_file}"
fi

sam local invoke "LambdaEdgeRewriteFunction" --event "${temp_event_file}"

# Clean up
rm -f "${temp_event_file}"
rm -f "${rule_path}"
