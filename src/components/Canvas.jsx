// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import React from 'react';
import { Background, Controls, MiniMap } from 'reactflow';

export default function Canvas() {
  return (
    <>
      <Background />
      <Controls />
      <MiniMap />
    </>
  );
}